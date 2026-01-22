export function formatSubmissionTime(timeInMicroseconds: number): string {
  if (timeInMicroseconds < 5_000) {
    return Math.round(timeInMicroseconds).toString() + " μs";
  } else if (timeInMicroseconds < 5_000_000) {
    return Math.round(timeInMicroseconds / 1000).toString() + " ms";
  } else {
    return Math.round(timeInMicroseconds / 1_000_000).toString() + " s";
  }
}
