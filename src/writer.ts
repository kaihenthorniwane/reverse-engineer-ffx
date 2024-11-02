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

  private writeString(str: string): Buffer {
    const strBuffer = Buffer.from(str, "utf8");
    // Add null terminator
    const nullTerminated = Buffer.alloc(strBuffer.length + 1);
    strBuffer.copy(nullTerminated);
    nullTerminated[strBuffer.length] = 0;
    return nullTerminated;
  }

  private writeUInt32BE(num: number): Buffer {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(num);
    return buf;
  }

  private writeSection(type: string, data: Buffer): Buffer {
    const typeBuffer = this.writeString(type);
    const typePadding = Buffer.alloc(4 - (typeBuffer.length % 4));
    const lengthBuffer = this.writeUInt32BE(
      data.length + 8 + typePadding.length
    );

    const dataPadding = Buffer.alloc(4 - (data.length % 4));

    return Buffer.concat([
      typeBuffer,
      typePadding,
      lengthBuffer,
      data,
      dataPadding,
    ]);
  }

  private writeHeader(): Buffer {
    const signature = this.writeString("RIFX");
    const sizePlaceholder = this.writeUInt32BE(0);
    const format = this.writeString("FaFX");
    const head = this.writeSection(
      "head",
      Buffer.from([
        0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x44, 0x00, 0x00, 0x00, 0x01,
      ])
    );
    return Buffer.concat([signature, sizePlaceholder, format, head]);
  }

  private writeBoilerplate(): Buffer {
    const sections: Buffer[] = [];

    // Write .pbescbeso section with proper nesting
    const pbescSection = this.writeSection(
      "LIST",
      Buffer.concat([
        this.writeString(".pbescbeso"),
        this.writeSection(
          "LIST",
          Buffer.concat([
            this.writeString("tdsptdot"),
            this.writeSection("tdpl", Buffer.alloc(0)),
            this.writeSection(
              "LIST",
              Buffer.concat([
                this.writeString("@tdsitdix"),
                this.writeSection(
                  "tdmn",
                  this.writeString("(ADBE Effect Parade")
                ),
              ])
            ),
          ])
        ),
      ])
    );
    sections.push(pbescSection);

    return Buffer.concat(sections);
  }

  private writeEffectParade(effect: FFXEffect): Buffer {
    const sections: Buffer[] = [];

    // Write effect header with proper nesting
    const effectHeader = this.writeSection(
      "LIST",
      Buffer.concat([
        this.writeString("@tdsitdix"),
        this.writeSection("tdmn", this.writeString("(Pseudo/PEM Matchname")),
        this.writeSection("tdsn", this.writeString(effect.controlName)),
        this.writeSection(
          "LIST",
          Buffer.concat([
            this.writeString("dtdsptdot"),
            this.writeSection("tdpl", Buffer.alloc(0)),
          ])
        ),
      ])
    );
    sections.push(effectHeader);

    // Write parameter sections with proper nesting
    const paramContainer = this.writeSection(
      "LIST",
      Buffer.concat([
        this.writeString("parTparn"),
        ...effect.controlArray.map((control, index) =>
          this.writeParameterSection(control, index)
        ),
      ])
    );
    sections.push(paramContainer);

    return Buffer.concat(sections);
  }

  private writeParameterSection(control: FFXControl, index: number): Buffer {
    const sections: Buffer[] = [];

    // Write parameter with proper structure
    sections.push(
      this.writeSection(
        "tdmn",
        this.writeString(
          `(Pseudo/PEM Matchname-${index.toString().padStart(4, "0")}`
        )
      )
    );

    // Write parameter data with proper nesting
    const paramData = this.writeSection(
      "LIST",
      Buffer.concat([
        this.writeString("tdbstdsb"),
        this.writeSection("tdsn", this.writeString(control.name)),
        this.writeSection("tdb4", Buffer.alloc(132)), // Standard block size
        this.writeSection("cdat", this.writeControlData(control)),
      ])
    );
    sections.push(paramData);

    if (control.type === "popup") {
      sections.push(
        this.writeSection(
          "pdnm",
          this.writeString(
            control.default?.content || "Option 1|Option 2|Option 3"
          )
        )
      );
    }

    return Buffer.concat(sections);
  }

  private writeControlData(control: FFXControl): Buffer {
    switch (control.type) {
      case "slider":
        const sliderData = Buffer.alloc(156); // Standard parameter block size
        sliderData.writeFloatBE(control.default || 0, 0);
        return sliderData;

      case "color":
        const colorData = Buffer.alloc(156);
        const color = control.default || { red: 0, green: 0, blue: 0 };
        colorData.writeFloatBE(color.red / 255, 0);
        colorData.writeFloatBE(color.green / 255, 4);
        colorData.writeFloatBE(color.blue / 255, 8);
        return colorData;

      default:
        return Buffer.alloc(0);
    }
  }

  private writeControlSection(control: FFXControl): Buffer {
    const sections: Buffer[] = [];

    // Write control name section
    sections.push(this.writeSection("tdsn", this.writeString(control.name)));

    // Write matchname section
    sections.push(
      this.writeSection("tdmn", this.writeString(`(${control.matchname}`))
    );

    // Write parameter data section
    const paramData = this.writeControlData(control);
    if (paramData.length > 0) {
      sections.push(this.writeSection("pard", paramData));
    }

    // Combine all sections into a LIST
    return this.writeSection("LIST", Buffer.concat(sections));
  }

  public writeFFX(effect: FFXEffect, outputPath: string): void {
    // Write header
    this.buffer.push(this.writeHeader());

    // Write boilerplate sections
    this.buffer.push(this.writeBoilerplate());

    // Write effect parade
    this.buffer.push(this.writeEffectParade(effect));

    // Write effect data sections
    const effectSections: Buffer[] = [];
    effect.controlArray.forEach((control) => {
      effectSections.push(this.writeControlSection(control));
    });

    // Write end marker
    effectSections.push(
      this.writeSection("tdmn", this.writeString("(ADBE Group End"))
    );

    // Write JSON metadata at the end
    const jsonData = JSON.stringify(effect, null, 2);
    effectSections.push(Buffer.from(jsonData));

    // Combine all sections
    this.buffer.push(Buffer.concat(effectSections));

    // Finalize and write file
    const finalBuffer = Buffer.concat(this.buffer);
    finalBuffer.writeUInt32BE(finalBuffer.length - 8, 4);

    const resolvedPath = path.resolve(__dirname, "../files", outputPath);
    fs.writeFileSync(resolvedPath, finalBuffer);
  }
}

export { FFXWriter, FFXEffect, FFXControl };
