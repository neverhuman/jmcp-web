declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

class JmcpPcmRingProcessor extends AudioWorkletProcessor {
  private queue: Float32Array[] = [];
  private readOffset = 0;
  private started = false;
  private idlePosted = true;
  private underrunPosted = false;
  private x1 = 0;
  private y1 = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<{ type?: string; samples?: ArrayBuffer }>) => {
      const data = event.data;
      if (data.type === "push" && data.samples instanceof ArrayBuffer) {
        this.queue.push(new Float32Array(data.samples));
        this.idlePosted = false;
        this.underrunPosted = false;
      } else if (data.type === "start") {
        this.started = true;
        this.idlePosted = false;
        this.underrunPosted = false;
      } else if (data.type === "clear") {
        this.queue = [];
        this.readOffset = 0;
        this.started = false;
        this.idlePosted = true;
        this.underrunPosted = false;
        this.x1 = 0;
        this.y1 = 0;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    const channel = output?.[0];
    if (channel === undefined) return true;

    let underrun = false;
    for (let i = 0; i < channel.length; i += 1) {
      let sample = 0;
      if (this.started) {
        const next = this.readSample();
        if (Number.isNaN(next)) {
          underrun = true;
        } else {
          sample = next;
        }
      }
      channel[i] = this.limit(this.dcBlock(sample));
    }

    if (this.started && underrun && !this.underrunPosted) {
      this.underrunPosted = true;
      this.port.postMessage({ type: "underrun" });
    }
    if (this.started && this.queue.length === 0 && !this.idlePosted) {
      this.idlePosted = true;
      this.port.postMessage({ type: "idle" });
    }
    return true;
  }

  private readSample(): number {
    while (this.queue.length > 0) {
      const head = this.queue[0];
      if (this.readOffset < head.length) {
        const sample = head[this.readOffset];
        this.readOffset += 1;
        return sample;
      }
      this.queue.shift();
      this.readOffset = 0;
    }
    return Number.NaN;
  }

  private dcBlock(sample: number): number {
    const y = sample - this.x1 + 0.995 * this.y1;
    this.x1 = sample;
    this.y1 = y;
    return y;
  }

  private limit(sample: number): number {
    if (sample > 0.96) return 0.96;
    if (sample < -0.96) return -0.96;
    return sample;
  }
}

registerProcessor("jmcp-pcm-ring", JmcpPcmRingProcessor);

export {};
