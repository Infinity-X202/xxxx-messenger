import { prisma } from "../db.js";
import { randomToken } from "./crypto.js";

export type DeviceFileRow = {
  id: string;
  userId: string;
  storageKey: string;
  originalFilename: string;
  folderPath: string;
  mimeType: string;
  size: number;
  createdAt: Date;
};

function mapRow(r: {
  id: string;
  user_id: string;
  storage_key: string;
  original_filename: string;
  folder_path: string;
  mime_type: string;
  size: number;
  created_at: Date;
}): DeviceFileRow {
  return {
    id: r.id,
    userId: r.user_id,
    storageKey: r.storage_key,
    originalFilename: r.original_filename,
    folderPath: r.folder_path,
    mimeType: r.mime_type,
    size: Number(r.size),
    createdAt: r.created_at,
  };
}

export async function insertDeviceFile(data: {
  userId: string;
  storageKey: string;
  originalFilename: string;
  folderPath: string;
  mimeType: string;
  size: number;
}): Promise<DeviceFileRow> {
  const id = `df_${randomToken(12)}`;
  const rows = await prisma.$queryRaw<
    {
      id: string;
      user_id: string;
      storage_key: string;
      original_filename: string;
      folder_path: string;
      mime_type: string;
      size: number;
      created_at: Date;
    }[]
  >`
    INSERT INTO device_files (id, user_id, storage_key, original_filename, folder_path, mime_type, size, created_at)
    VALUES (${id}, ${data.userId}, ${data.storageKey}, ${data.originalFilename}, ${data.folderPath}, ${data.mimeType}, ${data.size}, NOW())
    RETURNING id, user_id, storage_key, original_filename, folder_path, mime_type, size, created_at
  `;
  return mapRow(rows[0]!);
}

export async function listDeviceFiles(userId: string): Promise<DeviceFileRow[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      user_id: string;
      storage_key: string;
      original_filename: string;
      folder_path: string;
      mime_type: string;
      size: number;
      created_at: Date;
    }[]
  >`
    SELECT id, user_id, storage_key, original_filename, folder_path, mime_type, size, created_at
    FROM device_files
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 500
  `;
  return rows.map(mapRow);
}

export async function getDeviceFile(id: string, userId: string): Promise<DeviceFileRow | null> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      user_id: string;
      storage_key: string;
      original_filename: string;
      folder_path: string;
      mime_type: string;
      size: number;
      created_at: Date;
    }[]
  >`
    SELECT id, user_id, storage_key, original_filename, folder_path, mime_type, size, created_at
    FROM device_files
    WHERE id = ${id} AND user_id = ${userId}
    LIMIT 1
  `;
  return rows[0] ? mapRow(rows[0]) : null;
}
