build:
	docker-compose --profile bridge

up:
	docker-compose --profile bridge up -d --build

stop:
	docker-compose stop

clean:
	docker-compose down --rmi local -v --remove-orphans

logs:
	docker-compose logs -f

build-with-wt:
	docker-compose --profile bridge --profile watchtower build

up-with-wt:
	docker-compose --profile bridge --profile watchtower up -d --build
