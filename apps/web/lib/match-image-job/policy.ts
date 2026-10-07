import { MatchImageError } from "../match-image/errors";
import { MediaError } from "../media/errors";
import { OpenDotaError } from "../opendota/errors";

export function describeMatchImageJobError(error: unknown) {
  if (error instanceof MediaError) {
    return {
      code: error.code,
      message: `${error.code}: ${error.message}`,
      permanent: error.status < 500,
    };
  }
  if (error instanceof MatchImageError) {
    return {
      code: error.code,
      message: `${error.code}: ${error.message}`,
      permanent: true,
    };
  }
  if (error instanceof OpenDotaError) {
    return {
      code: error.code,
      message: `${error.code}: ${error.message}`,
      permanent: error.status < 500,
    };
  }

  console.error("Match image job failed", error);
  return {
    code: "match_image_job_failed",
    message: "match_image_job_failed: unexpected image worker error",
    permanent: false,
  };
}
