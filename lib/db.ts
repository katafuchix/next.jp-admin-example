import mongoose from "mongoose";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseAdmin: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseAdmin ?? {
  conn: null,
  promise: null,
};
global.mongooseAdmin = cached;

export async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.ADMIN_MONGODB_URI;
  if (!uri) {
    throw new Error("ADMIN_MONGODB_URI is not set in environment variables");
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

// 既存アプリDB（読み取り専用）
const APP_MONGODB_URI = process.env.APP_MONGODB_URI;

let appConnection: mongoose.Connection | null = null;

export async function connectAppDB(): Promise<mongoose.Connection | null> {
  if (!APP_MONGODB_URI) return null;
  if (appConnection) return appConnection;

  appConnection = mongoose.createConnection(APP_MONGODB_URI, {
    bufferCommands: false,
  });
  await appConnection.asPromise();
  return appConnection;
}
