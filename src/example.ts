import { FFXWriter, FFXEffect } from "./writer";

const effect: FFXEffect = {
  controlName: "My Effect",
  matchname: "Custom/Effect/Name",
  controlArray: [
    {
      name: "Slider Control",
      type: "slider",
      matchname: "Custom/Slider/1",
      canHaveKeyframes: true,
      canBeInvisible: false,
      id: Math.floor(Math.random() * 1000000000),
      hold: false,
      default: 50,
    },
    {
      name: "Color Control",
      type: "color",
      matchname: "Custom/Color/1",
      canHaveKeyframes: true,
      canBeInvisible: false,
      id: Math.floor(Math.random() * 1000000000),
      hold: false,
      default: { red: 255, green: 0, blue: 0 },
    },
  ],
};

const writer = new FFXWriter();
writer.writeFFX(effect, "./output/pseudo.ffx");
