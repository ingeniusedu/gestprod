export function cleanObject(obj: any): any {
  if (Array.isArray(obj)) {
    const cleanedArray = obj.map(v => cleanObject(v)).filter(v => v !== undefined);
    return cleanedArray; // Always return an array, even if empty
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        // Keep FieldValue instances (like deleteField()), even if they might internally represent a deletion
        // Also keep values that are not undefined
        if (value !== undefined || (value && typeof value === 'object' && (value as any)._methodName)) {
          newObj[key] = cleanObject(value);
        }
      }
    }
    return newObj;
  }
  return obj;
}
