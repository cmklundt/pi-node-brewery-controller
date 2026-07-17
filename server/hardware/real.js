/**
 * real.js — Raspberry Pi 5 hardware driver.
 *
 * GPIO:  libgpiod v2 via the `node-libgpiod` npm package. The Pi 5 routes
 *        GPIO through the RP1 southbridge, so every memory-mapped library
 *        (pigpio, wiringPi, rpi-gpio, onoff/sysfs) is dead on this hardware.
 *        The kernel character device (/dev/gpiochipN) is the supported path.
 *
 * SPI:   /dev/spidev0.0 via the `spi-device` npm package. The shield puts
 *        four MAX31865 chip-selects on plain GPIOs (8, 7, 25, 24), so CS is
 *        driven manually here (spidev's own CE lines are left alone; the
 *        kernel CS on spidev0.0 is GPIO8 which doubles as the HLT probe CS —
 *        we open spidev0.0 with SPI_NO_CS and toggle all four ourselves).
 *
 * Both packages are optionalDependencies — this module is only imported
 * when the server runs with --hardware, so a dev box never needs them.
 */
import { REG, configByte, readingF, CFG } from "./max31865.js";

const HEADER_CHIP_LABELS = ["pinctrl-rp1", "pinctrl-bcm2711", "pinctrl-bcm2835"];

export class RealDriver {
  constructor() {
    this.config = null;
    this.lines = {};       // gpio number -> libgpiod Line (outputs)
    this.inputs = {};      // gpio number -> Line (inputs)
    this.csLines = {};     // sensor id -> Line
    this.spi = null;
    this.chip = null;
    this.gpiod = null;
  }

  get name() { return "hardware"; }

  async init(config) {
    this.config = config;
    const { Chip, Line, available } = await import("node-libgpiod");
    this.gpiod = { Chip, Line };

    // Find the 40-pin header chip: gpiochip0 on current kernels, but scan
    // labels so a kernel that renumbers (as 6.6 did on Pi 5) still works.
    this.chip = this.#findHeaderChip(Chip);

    // Outputs: every actor, buzzer, and the four sensor CS lines (CS idles high)
    for (const a of config.actors) {
      this.lines[a.gpio] = this.#requestOutput(a.gpio, 0, `brewery-${a.id}`);
    }
    if (config.aux?.buzzer != null) {
      this.lines[config.aux.buzzer] = this.#requestOutput(config.aux.buzzer, 0, "brewery-buzzer");
    }
    for (const s of config.sensors.filter((s) => s.type === "max31865")) {
      this.csLines[s.id] = this.#requestOutput(s.cs, 1, `brewery-cs-${s.id}`);
    }
    if (config.interlock?.senseGpio != null) {
      this.inputs[config.interlock.senseGpio] =
        this.#requestInput(config.interlock.senseGpio, "brewery-interlock");
    }
    // Manual 120 V outlets with a sense wire (pilot relay / AC opto / flow
    // pulse): the Pi reads the truth instead of trusting the soft switch.
    for (const a of config.actors.filter((x) => x.senseGpio != null)) {
      this.inputs[a.senseGpio] = this.#requestInput(a.senseGpio, `brewery-sense-${a.id}`);
    }
    // Generic sense inputs — any free pin declared in config.inputs
    for (const inp of config.inputs || []) {
      if (inp.gpio != null && !this.inputs[inp.gpio]) {
        this.inputs[inp.gpio] = this.#requestInput(inp.gpio, `brewery-input-${inp.id}`);
      }
    }

    // SPI bus for the MAX31865s — manual CS, mode 1 (CPOL=0, CPHA=1)
    const spiDevice = (await import("spi-device")).default;
    this.spi = await new Promise((res, rej) => {
      const d = spiDevice.open(0, 0, { noChipSelect: true }, (err) => err ? rej(err) : res(d));
    });

    // Program each converter for continuous conversion
    const cfg = configByte(config.rtd);
    for (const s of config.sensors.filter((s) => s.type === "max31865")) {
      await this.#write(s.id, REG.CONFIG, cfg | CFG.FAULT_CLEAR);
    }
    await sleep(70); // first conversion
    return this;
  }

  #findHeaderChip(Chip) {
    for (let n = 0; n < 8; n++) {
      try {
        const c = new Chip(n);
        const label = typeof c.getChipLabel === "function" ? c.getChipLabel() : "";
        if (HEADER_CHIP_LABELS.some((l) => label.includes(l))) return c;
      } catch { /* no such chip */ }
    }
    return new Chip(0); // current Pi OS kernels alias the header to chip 0
  }

  #requestOutput(gpio, initial, consumer) {
    const line = this.chip.getLine(gpio);
    line.requestOutputMode(initial, consumer);
    return line;
  }

  #requestInput(gpio, consumer) {
    const line = this.chip.getLine(gpio);
    line.requestInputMode(consumer);
    return line;
  }

  // ── MAX31865 SPI, manual chip-select ──
  async #xfer(sensorId, tx) {
    const cs = this.csLines[sensorId];
    cs.setValue(0);
    try {
      const rx = await new Promise((res, rej) => {
        const msg = [{ sendBuffer: tx, receiveBuffer: Buffer.alloc(tx.length), byteLength: tx.length, speedHz: 500000, mode: 1 }];
        this.spi.transfer(msg, (err, m) => err ? rej(err) : res(m[0].receiveBuffer));
      });
      return rx;
    } finally {
      cs.setValue(1);
    }
  }

  async #write(sensorId, reg, val) {
    await this.#xfer(sensorId, Buffer.from([reg | 0x80, val]));
  }

  async #read(sensorId, reg, n = 1) {
    const rx = await this.#xfer(sensorId, Buffer.from([reg & 0x7f, ...Array(n).fill(0)]));
    return rx.subarray(1);
  }

  async readSensors() {
    const out = {};
    for (const s of this.config.sensors) {
      if (s.type !== "max31865") continue;
      try {
        const b = await this.#read(s.id, REG.RTD_MSB, 2);
        const r = readingF(b[0], b[1], this.config.rtd.refResistor);
        if (r.fault) {
          const fs = await this.#read(s.id, REG.FAULT_STATUS, 1);
          await this.#write(s.id, REG.CONFIG, configByte(this.config.rtd) | CFG.FAULT_CLEAR);
          out[s.id] = { tempF: null, fault: true, faultBits: fs[0] };
        } else {
          out[s.id] = { tempF: +(r.tempF + (s.calibrationOffset || 0)).toFixed(2), fault: false };
        }
      } catch (e) {
        out[s.id] = { tempF: null, fault: true, error: e.message };
      }
    }
    return out;
  }

  async setActor(id, on) {
    const a = this.config.actors.find((x) => x.id === id);
    if (!a) return;
    // Drive chain is non-inverting: GPIO high -> load on. INVERTED must stay false.
    const level = this.config.inverted ? (on ? 0 : 1) : (on ? 1 : 0);
    this.lines[a.gpio]?.setValue(level);
  }

  async readInterlock() {
    const g = this.config.interlock?.senseGpio;
    if (g == null || !this.inputs[g]) return null; // not wired -> unknown
    // Single opto senses "an element bank is armed". Which one is armed is
    // still reported by the operator-facing selector switch; see config.
    return this.inputs[g].getValue() ? this.config.interlock.senseHighMeans || "ARMED" : "OFF";
  }

  /** read any requested input pin (null = not wired/requested) */
  async readGpio(gpio) {
    if (gpio == null || !this.inputs[gpio]) return null;
    return this.inputs[gpio].getValue() === 1;
  }

  async setBuzzer(on) {
    const g = this.config.aux?.buzzer;
    if (g != null && this.lines[g]) this.lines[g].setValue(on ? 1 : 0);
  }

  async close() {
    for (const a of this.config.actors) await this.setActor(a.id, false);
    await this.setBuzzer(false);
    for (const l of Object.values(this.lines)) { try { l.release(); } catch {} }
    for (const l of Object.values(this.csLines)) { try { l.release(); } catch {} }
    for (const l of Object.values(this.inputs)) { try { l.release(); } catch {} }
    if (this.spi) await new Promise((r) => this.spi.close(r));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
