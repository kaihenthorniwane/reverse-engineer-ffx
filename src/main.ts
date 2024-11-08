// the goal of this project is to reverse engineer the binary file format of the after effects ffx format in ./test-files/pseudo.ffx and create a typescript library to read and write ffx files
// the ffx file generated by this should be output to ./output/pseudo.ffx

import * as fs from "fs";
import * as path from "path";

interface FFXSection {
  type: string;
  offset: number;
  length: number;
  children: FFXSection[];
  data?: Buffer;
  value?: any;
}

class FFXStructureAnalyzer {
  private buffer: Buffer;
  private position: number = 0;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  readString(length: number): string {
    if (this.position + length > this.buffer.length) {
      throw new Error(
        `Buffer overflow: Trying to read ${length} bytes at position ${this.position}`
      );
    }
    const str = this.buffer
      .slice(this.position, this.position + length)
      .toString("utf8");
    this.position += length;
    return str;
  }

  readUInt32(): number {
    if (this.position + 4 > this.buffer.length) {
      throw new Error(
        `Buffer overflow: Trying to read 4 bytes at position ${this.position}`
      );
    }
    const value = this.buffer.readUInt32BE(this.position);
    this.position += 4;
    return value;
  }

  parseSection(offset: number = 0): FFXSection | null {
    try {
      this.position = offset;

      if (this.position >= this.buffer.length) {
        return null;
      }

      while (
        this.position < this.buffer.length &&
        this.buffer[this.position] === 0
      ) {
        this.position++;
        offset++;
      }

      console.log(
        `Debug at offset ${offset}: ${this.formatDebugBytes(offset)}`
      );

      const type = this.readString(4);
      if (!this.isValidSectionType(type)) {
        console.warn(`Invalid section type "${type}" at offset ${offset}`);
        console.log(`Context bytes: ${this.formatDebugBytes(offset - 8, 24)}`);
        return null;
      }

      const length = this.readUInt32();

      if (
        length < 0 ||
        length > 10000 ||
        offset + length > this.buffer.length
      ) {
        console.warn(`Invalid section length ${length} at offset ${offset}`);
        return null;
      }

      console.log(
        `Found section ${type} with length ${length} at offset ${offset}`
      );

      const section: FFXSection = {
        type,
        offset,
        length,
        children: [],
      };

      switch (type) {
        case "RIFX":
          const formType = this.readString(4);
          section.value = formType;
          let childOffset = this.position;
          while (childOffset < offset + length) {
            const child = this.parseSection(childOffset);
            if (!child) break;
            section.children.push(child);
            childOffset += child.length + 8;
            if (childOffset % 2 !== 0) childOffset++;
          }
          break;

        case "LIST":
          const listType = this.readString(4);
          section.value = listType;

          let listChildOffset = this.position;
          const endOffset = offset + length;

          console.log(
            `Parsing LIST of type ${listType} from ${listChildOffset} to ${endOffset}`
          );

          while (listChildOffset < endOffset) {
            const child = this.parseSection(listChildOffset);
            if (!child) {
              console.log(`Failed to parse child at offset ${listChildOffset}`);
              console.log(
                `Remaining bytes: ${this.formatDebugBytes(listChildOffset)}`
              );
              break;
            }
            section.children.push(child);
            listChildOffset += child.length + 8;
            if (listChildOffset % 2 !== 0) listChildOffset++;
          }
          break;

        case "fnam":
          const nameData = this.buffer.slice(this.position, offset + length);
          section.value = nameData.toString("utf8").replace(/\0+$/, "");
          this.position = offset + length;
          break;

        case "tdsb":
          section.value = {
            propertyType: this.readUInt32(),
            value: this.readUInt32(),
            flags: this.readUInt32(),
          };
          break;

        case "tdmn":
          const menuNameLength = length - 8;
          if (menuNameLength > 0) {
            section.value = this.readString(menuNameLength).replace(/\0+$/, "");
          }
          break;

        case "tdsn":
          const displayNameLength = length - 8;
          if (displayNameLength > 0) {
            section.value = this.readString(displayNameLength).replace(
              /\0+$/,
              ""
            );
          }
          break;

        case "tdsl":
          section.value = {
            defaultValue: this.readUInt32(),
            minValue: this.readUInt32(),
            maxValue: this.readUInt32(),
            precision: this.readUInt32(),
          };
          break;

        case "tdpt":
          section.value = this.readUInt32();
          break;

        case "tdpi":
          section.value = this.readUInt32();
          break;

        case "tdps":
          section.value = {
            type: this.readUInt32(),
            flags: this.readUInt32(),
          };
          break;

        case "prmm":
        case "tdxp":
        case "tglf":
        case "tdpf":
          section.data = this.buffer.slice(this.position, offset + length);
          this.position = offset + length;
          break;

        case "parn":
          section.value = {
            count: this.readUInt32(),
          };
          break;

        case "tdb4":
          section.value = {
            value1: this.readUInt32(),
            value2: this.readUInt32(),
            value3: this.readUInt32(),
            value4: this.readUInt32(),
            ...(length > 16
              ? {
                  value5: this.readUInt32(),
                  value6: this.readUInt32(),
                  value7: this.readUInt32(),
                  value8: this.readUInt32(),
                }
              : {}),
          };
          if (this.position < offset + length) {
            section.data = this.buffer.slice(this.position, offset + length);
            this.position = offset + length;
          }
          break;

        default:
          section.data = this.buffer.slice(this.position, offset + length);
          this.position = offset + length;
      }

      return section;
    } catch (error) {
      console.error(`Error parsing section at offset ${offset}:`, error);
      console.log(`Context bytes: ${this.formatDebugBytes(offset - 8, 24)}`);
      return null;
    }
  }

  private formatDebugBytes(offset: number, length: number = 16): string {
    const start = Math.max(0, offset);
    const end = Math.min(this.buffer.length, start + length);
    const bytes = this.buffer.slice(start, end);
    return bytes.toString("hex").match(/.{2}/g)?.join(" ") || "";
  }

  private isValidSectionType(type: string): boolean {
    const validTypes = [
      "RIFX",
      "LIST",
      "head",
      "beso",
      "tdot",
      "tdpl",
      "tdix",
      "tdmn",
      "tdsn",
      "tdsb",
      "tdsl",
      "tdpt",
      "tdpi",
      "tdps",
      "tdpk",
      "tdgp",
      "Fsld",
      "tdsc",
      "tdum",
      "tdst",
      "fnam",
      "prmm",
      "tdxp",
      "tglf",
      "tdpf",
      "parn",
      "tdb4",
      "parT",
      "sspc",
    ];
    return validTypes.includes(type);
  }

  private parseChildren(start: number, length: number): FFXSection[] {
    const children: FFXSection[] = [];
    let currentOffset = start;
    const endOffset = start + length;

    while (currentOffset < endOffset) {
      if (currentOffset + 8 > this.buffer.length) {
        break;
      }

      const section = this.parseSection(currentOffset);
      if (!section) break;

      children.push(section);
      currentOffset += Math.max(section.length + 8, 8);
    }

    return children;
  }
}

class FFXAnalyzer {
  private buffer: Buffer;
  private structureAnalyzer: FFXStructureAnalyzer;

  constructor(filePath: string) {
    const resolvedPath = path.resolve(__dirname, "../", filePath);
    this.buffer = fs.readFileSync(resolvedPath);
    this.structureAnalyzer = new FFXStructureAnalyzer(this.buffer);
  }

  analyze(): void {
    console.log("File size:", this.buffer.length, "bytes");

    console.log("First 32 bytes:", this.buffer.slice(0, 32).toString("hex"));

    const structure = this.structureAnalyzer.parseSection(0);

    if (structure) {
      this.printStructure(structure, 0);
    }
  }

  private printStructure(section: FFXSection, depth: number): void {
    const indent = "  ".repeat(depth);

    console.log(`${indent}${section.type} (${section.length} bytes)`);

    if (section.value !== undefined) {
      if (typeof section.value === "object") {
        Object.entries(section.value).forEach(([key, value]) => {
          console.log(`${indent}  ${key}: ${value}`);
        });
      } else {
        console.log(`${indent}  Value: ${section.value}`);
      }
    }

    if (section.data && !section.value) {
      if (this.looksLikeText(section.data)) {
        console.log(
          `${indent}  Text: "${section.data.toString("utf8").trim()}"`
        );
      } else {
        console.log(
          `${indent}  Data: ${this.formatHexDump(
            section.data.slice(0, Math.min(16, section.data.length))
          )}`
        );
      }
    }

    section.children.forEach((child) => {
      this.printStructure(child, depth + 1);
    });
  }

  private formatHexDump(buffer: Buffer): string {
    return buffer.toString("hex").match(/.{2}/g)?.join(" ") || "";
  }

  private looksLikeText(buffer: Buffer): boolean {
    let printable = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] >= 32 && buffer[i] <= 126) {
        printable++;
      }
    }
    return printable / buffer.length > 0.8;
  }
}

const analyzer = new FFXAnalyzer("files/test-files/just-one-slider.ffx");
analyzer.analyze();
