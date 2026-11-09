export interface SourceCoverageInput {
  chunkIds: string[];
  linkedChunkIds: string[];
}

export interface SourceCoverageSummary {
  totalChunks: number;
  coveredChunks: number;
  uncoveredChunks: number;
  coverageRatio: number;
}

export function calculateSourceCoverage(input: SourceCoverageInput): SourceCoverageSummary {
  const totalChunks = new Set(input.chunkIds).size;
  const coveredChunks = [...new Set(input.linkedChunkIds)].filter((chunkId) => input.chunkIds.includes(chunkId)).length;
  const uncoveredChunks = Math.max(totalChunks - coveredChunks, 0);

  return {
    totalChunks,
    coveredChunks,
    uncoveredChunks,
    coverageRatio: totalChunks === 0 ? 0 : coveredChunks / totalChunks
  };
}
