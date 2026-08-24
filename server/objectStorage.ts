import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { Response } from "express";
import { randomUUID } from "crypto";
import { PassThrough, Readable } from "stream";

// S3-compatible object storage. Works with AWS S3, Cloudflare R2, and local
// MinIO — select the backend purely via env vars:
//   S3_BUCKET             required, bucket name
//   S3_ACCESS_KEY_ID      required
//   S3_SECRET_ACCESS_KEY  required
//   S3_ENDPOINT           optional; set for R2 ("https://<account>.r2.cloudflarestorage.com")
//                         or MinIO ("http://localhost:9000"); omit for AWS S3
//   S3_REGION             optional; defaults to "auto" with a custom endpoint,
//                         "us-east-1" otherwise
//   S3_PREFIX             optional key prefix inside the bucket, e.g. "prod"
const endpoint = process.env.S3_ENDPOINT;

export const objectStorageClient = new S3Client({
  region: process.env.S3_REGION || (endpoint ? "auto" : "us-east-1"),
  ...(endpoint
    ? {
        endpoint,
        forcePathStyle: true,
      }
    : {}),
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
});

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error(
      "S3_BUCKET not set. Configure S3-compatible object storage via " +
        "S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_ENDPOINT for R2/MinIO).",
    );
  }
  return bucket;
}

function getPrefix(): string {
  const prefix = process.env.S3_PREFIX || "";
  if (!prefix) return "";
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export interface StorageFileMetadata {
  contentType?: string;
  size?: number;
}

// Thin file handle mirroring the subset of the GCS File API the app uses
// (exists / getMetadata / createReadStream / download), so call sites keep
// their existing shape.
export class StorageFile {
  constructor(
    public readonly bucket: string,
    public readonly key: string,
  ) {}

  get name(): string {
    return this.key;
  }

  async exists(): Promise<[boolean]> {
    try {
      await objectStorageClient.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.key }),
      );
      return [true];
    } catch (error: any) {
      if (
        error?.name === "NotFound" ||
        error?.$metadata?.httpStatusCode === 404
      ) {
        return [false];
      }
      throw error;
    }
  }

  async getMetadata(): Promise<[StorageFileMetadata]> {
    const head = await objectStorageClient.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: this.key }),
    );
    return [
      {
        contentType: head.ContentType,
        size: head.ContentLength,
      },
    ];
  }

  async getReadStream(): Promise<Readable> {
    const result = await objectStorageClient.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
    );
    return result.Body as Readable;
  }

  // GCS-compatible streaming interface: returns a stream that starts flowing
  // once the underlying GET resolves and emits "error" on failure.
  createReadStream(): Readable {
    const passthrough = new PassThrough();
    this.getReadStream()
      .then((body) => body.pipe(passthrough))
      .catch((err) => passthrough.emit("error", err));
    return passthrough;
  }

  async download(): Promise<[Buffer]> {
    const result = await objectStorageClient.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return [Buffer.concat(chunks)];
  }
}

export class ObjectStorageService {
  constructor() {}

  // Uploads a buffer to the media area. Returns a normalized "/media/<id>"
  // path that getMediaFile() can resolve (same path scheme as before the
  // migration, so existing DB references keep working).
  async uploadMediaBuffer(
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const bucket = getBucket();
    const mediaId = randomUUID();
    const key = `${getPrefix()}media/${mediaId}`;

    await objectStorageClient.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      }),
    );

    return `/media/${mediaId}`;
  }

  // Resolves a "/media/<id>" path to a file handle, verifying existence.
  async getMediaFile(objectPath: string): Promise<StorageFile> {
    if (!objectPath.startsWith("/media/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const mediaId = parts.slice(1).join("/");
    const file = new StorageFile(getBucket(), `${getPrefix()}media/${mediaId}`);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
  }

  // Streams an object to the HTTP response.
  async downloadObject(
    file: StorageFile,
    res: Response,
    cacheTtlSec: number = 3600,
  ) {
    try {
      const [metadata] = await file.getMetadata();
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        ...(metadata.size != null
          ? { "Content-Length": String(metadata.size) }
          : {}),
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      });

      const stream = await file.getReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }
}
