/**
 * max31865.js — register map + RTD math for the MAX31865 PT100 converter.
 * Pure functions; the SPI transport lives in real.js so this file is
 * unit-testable anywhere.
 *
 * Callendar–Van Dusen (ITS-90, alpha=0.00385 PT100):
 *   R(T) = R0 (1 + aT + bT²)   for T >= 0 °C
 */
export const REG = {
  CONFIG: 0x00,
  RTD_MSB: 0x01,
  RTD_LSB: 0x02,
  HIGH_FAULT_MSB: 0x03,
  FAULT_STATUS: 0x07,
};

// Config bits
export const CFG = {
  VBIAS: 0x80,
  AUTO_CONVERT: 0x40,
  ONE_SHOT: 0x20,
  THREE_WIRE: 0x10,
  FAULT_CLEAR: 0x02,
  FILTER_50HZ: 0x01,
};

const R0 = 100; // PT100
const A = 3.9083e-3;
const B = -5.775e-7;

/** Build the config byte for continuous conversion. */
export function configByte({ wires = 3, filterHz = 60 } = {}) {
  let c = CFG.VBIAS | CFG.AUTO_CONVERT;
  if (wires === 3) c |= CFG.THREE_WIRE;
  if (filterHz === 50) c |= CFG.FILTER_50HZ;
  return c;
}

/** 15-bit RTD code + reference resistor -> resistance in ohms. Bit0 of LSB is the fault flag. */
export function codeToResistance(msb, lsb, refResistor = 430) {
  const code = ((msb << 8) | lsb) >> 1;
  const fault = (lsb & 0x01) === 1;
  return { ohms: (code * refResistor) / 32768, fault, code };
}

/** Resistance -> °C via inverted CVD (quadratic for T>=0, cubic fit below). */
export function resistanceToC(r) {
  if (r >= R0) {
    // solve b*T^2 + a*T + (1 - r/R0) = 0
    const disc = A * A - 4 * B * (1 - r / R0);
    return (-A + Math.sqrt(disc)) / (2 * B);
  }
  // below 0 °C — polynomial approximation, plenty for a brewery
  let t = (r / R0 - 1) / A;
  for (let i = 0; i < 3; i++) {
    const rt = R0 * (1 + A * t + B * t * t);
    t += (r - rt) / (R0 * (A + 2 * B * t));
  }
  return t;
}

export const cToF = (c) => c * 9 / 5 + 32;

/** Full pipeline: raw registers -> °F reading with fault flag. */
export function readingF(msb, lsb, refResistor = 430) {
  const { ohms, fault } = codeToResistance(msb, lsb, refResistor);
  const c = resistanceToC(ohms);
  return { tempF: cToF(c), tempC: c, ohms, fault };
}
