import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now }
});

settingSchema.statics.get = async function (key, fallback = null) {
  const doc = await this.findOne({ key });
  return doc ? doc.value : fallback;
};

settingSchema.statics.set = async function (key, value) {
  return this.findOneAndUpdate(
    { key },
    { value, updatedAt: new Date() },
    { upsert: true, new: true }
  );
};

export default mongoose.model('Setting', settingSchema);
