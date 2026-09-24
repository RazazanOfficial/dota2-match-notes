// Older clients omit banOverride. Keep existing manual edits in that case.
export function banWritePolicy(incoming: boolean | undefined, existing: boolean | undefined) {
  return {
    override: incoming ?? existing ?? false,
    preserveRows: incoming === undefined && existing === true,
  };
}
