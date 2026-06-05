export {};

declare global {
  interface Window {
    setTimeout(handler: TimerHandler, timeout?: number, ...arguments_: any[]): number;
    clearTimeout(handle?: number): void;
  }
}
