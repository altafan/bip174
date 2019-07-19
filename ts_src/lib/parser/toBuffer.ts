import * as convert from '../converter';
import { keyValsToBuffer } from '../converter/tools';
import { KeyValue } from '../interfaces';
import { PsbtAttributes } from './index';

export function psbtToBuffer({
  globalMap,
  inputs,
  outputs,
}: PsbtAttributes): Buffer {
  const { globalKeyVals, inputKeyVals, outputKeyVals } = psbtToKeyVals({
    globalMap,
    inputs,
    outputs,
  });

  const globalBuffer = keyValsToBuffer(globalKeyVals);

  const keyValsOrEmptyToBuffer = (keyVals: KeyValue[][]): Buffer[] =>
    keyVals.length === 0 ? [Buffer.from([0])] : keyVals.map(keyValsToBuffer);

  const inputBuffers = keyValsOrEmptyToBuffer(inputKeyVals);
  const outputBuffers = keyValsOrEmptyToBuffer(outputKeyVals);

  const header = Buffer.allocUnsafe(5);
  header.writeUIntBE(0x70736274ff, 0, 5);
  return Buffer.concat(
    [header, globalBuffer].concat(inputBuffers, outputBuffers),
  );
}

const sortKeyVals = (a: KeyValue, b: KeyValue): number => {
  return a.key.compare(b.key);
};

function keyValsFromMap(keyValMap: any, converterFactory: any): KeyValue[] {
  const attributes = Object.keys(keyValMap).filter(k => k !== 'unknownKeyVals');
  const keyVals = [] as KeyValue[];
  const keyHexes: Set<string> = new Set();
  for (const attrKey of attributes) {
    // We are checking for undefined anyways. So ignore TS error
    // @ts-ignore
    const converter = converterFactory[attrKey];
    if (converter === undefined) continue;
    // @ts-ignore
    const data = keyValMap[attrKey] as any;

    const keyVal = Array.isArray(data)
      ? (data.map(converter.encode) as KeyValue[])
      : (converter.encode(data) as KeyValue);

    if (Array.isArray(keyVal)) {
      const hexes = keyVal.map(kv => kv.key.toString('hex'));
      hexes.forEach(hex => {
        if (keyHexes.has(hex))
          throw new Error('Serialize Error: Duplicate key: ' + hex);
        keyHexes.add(hex);
      });
      keyVals.push(...keyVal);
    } else {
      const hex = keyVal.key.toString('hex');
      if (keyHexes.has(hex))
        throw new Error('Serialize Error: Duplicate key: ' + hex);
      keyHexes.add(hex);
      keyVals.push(keyVal);
    }
  }

  // Get other keyVals that have not yet been gotten
  const otherKeyVals = keyValMap.unknownKeyVals
    ? keyValMap.unknownKeyVals.filter((keyVal: KeyValue) => {
        return !keyHexes.has(keyVal.key.toString('hex'));
      })
    : [];

  return keyVals.concat(otherKeyVals).sort(sortKeyVals);
}

export function psbtToKeyVals({
  globalMap,
  inputs,
  outputs,
}: PsbtAttributes): {
  globalKeyVals: KeyValue[];
  inputKeyVals: KeyValue[][];
  outputKeyVals: KeyValue[][];
} {
  // First parse the global keyVals
  // Get any extra keyvals to pass along
  const globalKeyVals = keyValsFromMap(globalMap, convert.globals);
  const inputKeyVals = inputs.map(input =>
    keyValsFromMap(input, convert.inputs),
  );
  const outputKeyVals = outputs.map(output =>
    keyValsFromMap(output, convert.outputs),
  );

  return {
    globalKeyVals,
    inputKeyVals,
    outputKeyVals,
  };
}
