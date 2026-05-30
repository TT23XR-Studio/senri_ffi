export const TYPES = {
  void:    'void',
  int8:    'int8',
  uint8:   'uint8',
  int16:   'int16',
  uint16:  'uint16',
  int32:   'int32',
  uint32:  'uint32',
  int64:   'int64',
  uint64:  'uint64',
  float32: 'float32',
  float64: 'float64',
  pointer: 'pointer',
  cstring: 'cstring',
} as const;

export type TypeName = (typeof TYPES)[keyof typeof TYPES];

export const TYPE_SIZES: Record<string, number> = {
  void:    0,
  int8:    1,
  uint8:   1,
  int16:   2,
  uint16:  2,
  int32:   4,
  uint32:  4,
  int64:   8,
  uint64:  8,
  float32: 4,
  float64: 8,
  pointer: 8,
  cstring: 8,
};

export const TYPE_ALIGNS: Record<string, number> = {
  void:    1,
  int8:    1,
  uint8:   1,
  int16:   2,
  uint16:  2,
  int32:   4,
  uint32:  4,
  int64:   8,
  uint64:  8,
  float32: 4,
  float64: 8,
  pointer: 8,
  cstring: 8,
};
