import * as fs from "fs";

function compareFFXFiles(file1: string, file2: string): void {
  const buffer1 = fs.readFileSync(file1);
  const buffer2 = fs.readFileSync(file2);

  console.log("File 1 size:", buffer1.length);
  console.log("File 2 size:", buffer2.length);

  // Find common sequences
  const minSequenceLength = 4;
  const maxSequenceLength = 32;

  for (let len = minSequenceLength; len <= maxSequenceLength; len++) {
    for (let i = 0; i < buffer1.length - len; i++) {
      const sequence = buffer1.slice(i, i + len);
      const pos2 = buffer2.indexOf(sequence);

      if (pos2 !== -1) {
        console.log(
          `Common sequence at File1[${i}] and File2[${pos2}]:`,
          sequence.toString("hex")
        );
      }
    }
  }
}
