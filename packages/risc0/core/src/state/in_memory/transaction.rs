use crate::{
    database::{
        Column,
        Result as DatabaseResult,
    },
    state::{
        in_memory::memory_store::MemoryStore,
        BatchOperations,
        DataSource,
        IterDirection,
        KVItem,
        KeyValueStore,
        TransactableStorage,
        Value,
        WriteOperation,
    },
};
use fuel_core_storage::iter::{
    BoxedIter,
    IntoBoxedIter,
};
use itertools::{
    EitherOrBoth,
    Itertools,
};
use std::{
    cmp::Ordering,
    collections::HashMap,
    fmt::Debug,
    ops::DerefMut,
    sync::{
        Arc,
        Mutex,
    },
};

#[derive(Debug)]
pub struct MemoryTransactionView {
    view_layer: MemoryStore,
    // TODO: Remove `Mutex`.
    // use hashmap to collapse changes (e.g. insert then remove the same key)
    changes: [Mutex<HashMap<Vec<u8>, WriteOperation>>; Column::COUNT],
    data_source: DataSource,
}

impl MemoryTransactionView {
    pub fn new(source: DataSource) -> Self {
        Self {
            view_layer: MemoryStore::default(),
            changes: Default::default(),
            data_source: source,
        }
    }

    pub fn commit(&self) -> DatabaseResult<()> {
        let mut iter = self
            .changes
            .iter()
            .zip(enum_iterator::all::<Column>())
            .flat_map(|(column_map, column)| {
                let mut map = column_map.lock().expect("poisoned lock");
                let changes = core::mem::take(map.deref_mut());

                changes.into_iter().map(move |t| (t.0, column, t.1))
            });

        self.data_source.batch_write(&mut iter)
    }
}

impl KeyValueStore for MemoryTransactionView {
    fn get(&self, key: &[u8], column: Column) -> DatabaseResult<Option<Value>> {
        // try to fetch data from View layer if any changes to the key
        if self.changes[column.as_usize()]
            .lock()
            .expect("poisoned lock")
            .contains_key(&key.to_vec())
        {
            self.view_layer.get(key, column)
        } else {
            // fall-through to original data source
            self.data_source.get(key, column)
        }
    }

    fn put(
        &self,
        key: &[u8],
        column: Column,
        value: Value,
    ) -> DatabaseResult<Option<Value>> {
        let key_vec = key.to_vec();
        let contained_key = self.changes[column.as_usize()]
            .lock()
            .expect("poisoned lock")
            .insert(key_vec, WriteOperation::Insert(value.clone()))
            .is_some();
        let res = self.view_layer.put(key, column, value);
        if contained_key {
            res
        } else {
            self.data_source.get(key, column)
        }
    }

    fn delete(&self, key: &[u8], column: Column) -> DatabaseResult<Option<Value>> {
        let k = key.to_vec();
        let contained_key = self.changes[column.as_usize()]
            .lock()
            .expect("poisoned lock")
            .insert(k, WriteOperation::Remove)
            .is_some();
        let res = self.view_layer.delete(key, column);
        if contained_key {
            res
        } else {
            self.data_source.get(key, column)
        }
    }

    fn exists(&self, key: &[u8], column: Column) -> DatabaseResult<bool> {
        let k = key.to_vec();
        if self.changes[column.as_usize()]
            .lock()
            .expect("poisoned lock")
            .contains_key(&k)
        {
            self.view_layer.exists(key, column)
        } else {
            self.data_source.exists(key, column)
        }
    }

    fn iter_all(
        &self,
        column: Column,
        prefix: Option<&[u8]>,
        start: Option<&[u8]>,
        direction: IterDirection,
    ) -> BoxedIter<KVItem> {
        // iterate over inmemory + db while also filtering deleted entries
        self.view_layer
                // iter_all returns items in sorted order
                .iter_all(column, prefix, start, direction)
                // Merge two sorted iterators (our current view overlay + backing data source)
                .merge_join_by(
                    self.data_source.iter_all(column, prefix, start, direction),
                    move |i, j| {
                        if let (Ok(i), Ok(j)) = (i, j) {
                            if IterDirection::Forward == direction {
                                i.0.cmp(&j.0)
                            } else {
                                j.0.cmp(&i.0)
                            }
                        } else {
                            // prioritize errors from db result first
                            if j.is_err() {
                                Ordering::Greater
                            } else {
                                Ordering::Less
                            }
                        }
                    },
                )
                .map(|either_both| {
                    match either_both {
                        // in the case of overlap, choose the left-side (our view overlay)
                        EitherOrBoth::Both(v, _)
                        | EitherOrBoth::Left(v)
                        | EitherOrBoth::Right(v) => v,
                    }
                })
                // filter entries which have been deleted over the course of this transaction
                .filter(move |item| {
                    if let Ok((key, _)) = item {
                        !matches!(
                            self.changes[column.as_usize()]
                                .lock()
                                .expect("poisoned")
                                .get(key),
                            Some(WriteOperation::Remove)
                        )
                    } else {
                        // ensure errors are propagated
                        true
                    }
                }).into_boxed()
    }

    fn size_of_value(&self, key: &[u8], column: Column) -> DatabaseResult<Option<usize>> {
        // try to fetch data from View layer if any changes to the key
        if self.changes[column.as_usize()]
            .lock()
            .expect("poisoned lock")
            .contains_key(&key.to_vec())
        {
            self.view_layer.size_of_value(key, column)
        } else {
            // fall-through to original data source
            self.data_source.size_of_value(key, column)
        }
    }

    fn read(
        &self,
        key: &[u8],
        column: Column,
        buf: &mut [u8],
    ) -> DatabaseResult<Option<usize>> {
        // try to fetch data from View layer if any changes to the key
        if self.changes[column.as_usize()]
            .lock()
            .expect("poisoned lock")
            .contains_key(&key.to_vec())
        {
            self.view_layer.read(key, column, buf)
        } else {
            // fall-through to original data source
            self.data_source.read(key, column, buf)
        }
    }

    fn read_alloc(&self, key: &[u8], column: Column) -> DatabaseResult<Option<Value>> {
        if self.changes[column.as_usize()]
            .lock()
            .expect("poisoned lock")
            .contains_key(&key.to_vec())
        {
            self.view_layer.read_alloc(key, column)
        } else {
            // fall-through to original data source
            self.data_source.read_alloc(key, column)
        }
    }

    fn write(&self, key: &[u8], column: Column, buf: &[u8]) -> DatabaseResult<usize> {
        let k = key.to_vec();
        self.changes[column.as_usize()]
            .lock()
            .expect("poisoned lock")
            .insert(k, WriteOperation::Insert(Arc::new(buf.to_vec())));
        self.view_layer.write(key, column, buf)
    }

    fn replace(
        &self,
        key: &[u8],
        column: Column,
        buf: &[u8],
    ) -> DatabaseResult<(usize, Option<Value>)> {
        let k = key.to_vec();
        let contained_key = {
            let mut lock = self.changes[column.as_usize()]
                .lock()
                .expect("poisoned lock");
            lock.insert(k, WriteOperation::Insert(Arc::new(buf.to_vec())))
                .is_some()
        };
        let res = self.view_layer.replace(key, column, buf)?;
        let num_written = res.0;
        if contained_key {
            Ok(res)
        } else {
            Ok((num_written, self.data_source.read_alloc(key, column)?))
        }
    }

    fn take(&self, key: &[u8], column: Column) -> DatabaseResult<Option<Value>> {
        let k = key.to_vec();
        let contained_key = {
            let mut lock = self.changes[column.as_usize()]
                .lock()
                .expect("poisoned lock");
            lock.insert(k, WriteOperation::Remove).is_some()
        };
        let res = self.view_layer.take(key, column);
        if contained_key {
            res
        } else {
            self.data_source.read_alloc(key, column)
        }
    }
}

impl BatchOperations for MemoryTransactionView {}

impl TransactableStorage for MemoryTransactionView {
    fn flush(&self) -> DatabaseResult<()> {
        for lock in self.changes.iter() {
            lock.lock().expect("poisoned lock").clear();
        }
        self.view_layer.flush()?;
        self.data_source.flush()
    }
}