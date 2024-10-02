
const sha1 = require('sha1');
const { ObjectId } = require('mongodb');
const dbClient = require('../utils/db');

class UsersController {
  static async postNew(req, res) {
    const { userQueue } = require('../utils/queue');

    // Inside postNew method after user creation
    const jobData = { userId: user._id };
    userQueue.add(jobData);
    const { email, password } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }
    
    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }
    
    const user = await dbClient.db.collection('users').findOne({ email });
    
    if (user) {
      return res.status(400).json({ error: 'Already exist' });
    }
    
    const hashedPassword = sha1(password);
    const result = await dbClient.db.collection('users').insertOne({ email, password: hashedPassword });
    const newUser = result.ops[0];
    
    return res.status(201).json({ id: newUser._id, email: newUser.email });
  }
  
}

module.exports = UsersController;
