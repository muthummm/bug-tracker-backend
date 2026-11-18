import mongoose from 'mongoose';
import { env } from './env.js';
import { Counter } from '../modules/counter/counter.model.js';
import { User } from '../modules/users/user.model.js';
import { Session } from '../modules/auth/session.model.js';
import { Project } from '../modules/projects/project.model.js';
import { Member } from '../modules/projects/member.model.js';
import { Bug } from '../modules/bugs/bug.model.js';
import { History } from '../modules/bugs/history.model.js';
import { Upload } from '../modules/uploads/upload.model.js';
import { Notification } from '../modules/notifications/notification.model.js';
import { PushSubscription } from '../modules/push/push.model.js';

const MODELS = [Counter, User, Session, Project, Member, Bug, History, Upload, Notification, PushSubscription];

/** Connects to MongoDB Atlas and makes sure every collection and index exists. */
export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongo.uri, { dbName: env.mongo.dbName, serverSelectionTimeoutMS: 15000 });
  await Promise.all(MODELS.map(m => m.createCollection().then(() => m.syncIndexes())));
  return mongoose.connection;
}

export const disconnectDatabase = () => mongoose.disconnect();

export const isDatabaseConnected = () => mongoose.connection.readyState === 1;
