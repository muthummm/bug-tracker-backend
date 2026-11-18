// One row per browser that turned on desktop notifications.
import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true, unique: true }, // unique per browser profile
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  user_id: { type: Number, required: true, index: true }, // whoever signed in on that browser last
  created_at: { type: Date, default: Date.now },
}, { versionKey: false });

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema, 'push_subscriptions');
