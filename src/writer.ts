import * as fs from "fs";
import * as path from "path";

interface FFXControl {
  name: string;
  type: string;
  matchname: string;
  canHaveKeyframes: boolean;
  canBeInvisible: boolean;
  invisible?: boolean;
  keyframes?: boolean;
  id: number;
  hold: boolean;
  default?: any;
  children?: FFXControl[];
}

interface FFXEffect {
  controlName: string;
  matchname: string;
  controlArray: FFXControl[];
}

class FFXWriter {
  private buffer: Buffer[] = [];

  constructor() {}

  private writeString(str: string): Buffer {
    return Buffer.from(str, "utf8");
  }

  private writeUInt32BE(num: number): Buffer {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(num);
    return buf;
  }

  private writeSection(type: string, data: Buffer): Buffer {
    const typeBuffer = this.writeString(type);
    const lengthBuffer = this.writeUInt32BE(data.length + 8);
    return Buffer.concat([typeBuffer, lengthBuffer, data]);
  }

  private writeHeader(): Buffer {
    const signature = this.writeString("RIFX");
    const sizePlaceholder = this.writeUInt32BE(0);
    const format = this.writeString("FaFX");
    return Buffer.concat([signature, sizePlaceholder, format]);
  }

  public writeFFX(effect: FFXEffect, outputPath: string): void {
    this.buffer.push(this.writeHeader());

    const effectData = JSON.stringify(effect);
    this.buffer.push(this.writeSection("LIST", this.writeString(effectData)));

    const finalBuffer = Buffer.concat(this.buffer);
    finalBuffer.writeUInt32BE(finalBuffer.length - 8, 4);

    const resolvedPath = path.resolve(__dirname, "../files", outputPath);
    fs.writeFileSync(resolvedPath, finalBuffer);
  }
}

export { FFXWriter, FFXEffect, FFXControl };
