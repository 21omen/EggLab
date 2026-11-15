import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

/** Broadcast a panel event to the renderer, the HTTP stream and job logs. */
export function emit(type, payload = {}) {
  const event = { type, at: Date.now(), ...payload };
  bus.emit('event', event);
  return event;
}

export function onEvent(handler) {
  bus.on('event', handler);
  return () => bus.off('event', handler);
}
