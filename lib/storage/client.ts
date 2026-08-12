import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getStorageConfig } from "./config";

let cachedClient: S3Client | null = null;
let cachedFingerprint = "";

function getClient() {
  const config = getStorageConfig();
  const fingerprint = [
    config.endpoint,
    config.region,
    config.forcePathStyle,
    config.accessKey,
    config.secretKey,
  ].join("|");

  if (!cachedClient || cachedFingerprint !== fingerprint) {
    cachedClient?.destroy();
    cachedClient = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
    cachedFingerprint = fingerprint;
  }

  return { client: cachedClient, config };
}

export async function uploadStoredObject(
  objectKey: string,
  mimeType: string,
  body: Uint8Array,
) {
  const { client, config } = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentLength: body.byteLength,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

export async function deleteStoredObject(objectKey: string) {
  const { client, config } = getClient();
  await client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }),
  );
}

export function isStorageNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
