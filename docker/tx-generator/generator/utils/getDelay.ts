// 1 minute
export const MIN_TIME = 1000 * 60 * 1;
// 3 minute
export const MAX_TIME = 1000 * 60 * 3;

export function getDelay() {
    return Math.round(MIN_TIME + Math.random() * (MAX_TIME - MIN_TIME));
}
