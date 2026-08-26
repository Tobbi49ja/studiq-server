import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://regan_db_user:o48dKFjInsCJiPui@test.2vhjs9p.mongodb.net/studiq';

async function makeAdmin() {
  await mongoose.connect(MONGO_URI);
  
  const result = await mongoose.connection.collection('users').updateOne(
    { email: 'tolusamuel040@gmail.com' },
    { $set: { role: 'admin' } }
  );

  if (result.matchedCount === 0) {
    console.log('User not found. Check the email address.');
  } else {
    console.log('✅ Success! tolusamuel040@gmail.com is now an admin.');
  }

  await mongoose.disconnect();
}

makeAdmin().catch(console.error);
