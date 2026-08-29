let prepareReplacement = async () => {};

export function registerProjectReplacementPreparation(prepare: () => Promise<void>): void {
  prepareReplacement = prepare;
}

export async function prepareForProjectReplacement(): Promise<void> {
  await prepareReplacement();
}
