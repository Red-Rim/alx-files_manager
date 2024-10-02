
const { ObjectId } = require('mongodb');
const mime = require('mime-types');
const fs = require('fs');
const path = require('path');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');
const { v4: uuidv4 } = require('uuid');

class FilesController {
  static async postUpload(req, res) {
    const { name, type, parentId = 0, isPublic = false, data } = req.body;
    const token = req.headers['x-token'];
    const { fileQueue } = require('../utils/queue');

    // Inside postUpload method after file creation
    if (type === 'image') {
      const jobData = { userId, fileId: file._id };
      fileQueue.add(jobData);
    }
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tokenKey = `auth_${token}`;
    const userId = await redisClient.get(tokenKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (!data && type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }

    let parentFile = null;

    if (parentId) {
      parentFile = await dbClient.db.collection('files').findOne({ _id: new ObjectId(parentId) });

      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const fileData = {
      userId: new ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: parentFile ? new ObjectId(parentId) : 0,
      localPath: '',
    };

    if (type !== 'folder') {
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      const fileName = `${uuidv4()}.${mime.extension(mime.lookup(name))}`;
      const localPath = path.join(folderPath, fileName);

      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      fs.writeFileSync(localPath, Buffer.from(data, 'base64'));
      fileData.localPath = localPath;
    }

    const result = await dbClient.db.collection('files').insertOne(fileData);
    const newFile = result.ops[0];

    return res.status(201).json({
      id: newFile._id,
      userId: newFile.userId,
      name: newFile.name,
      type: newFile.type,
      isPublic: newFile.isPublic,
      parentId: newFile.parentId,
    });
  }
  static async getShow(req, res) {
    const { id } = req.params;
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tokenKey = `auth_${token}`;
    const userId = await redisClient.get(tokenKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(id), userId: new ObjectId(userId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json(file);
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tokenKey = `auth_${token}`;
    const userId = await redisClient.get(tokenKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = req.query.parentId || 0;
    const page = req.query.page || 0;

    const files = await dbClient.db.collection('files').find({
      userId: new ObjectId(userId),
      parentId: parentId === '0' ? 0 : new ObjectId(parentId),
    })
      .skip(page * 20)
      .limit(20)
      .toArray();

    return res.status(200).json(files);
  }

  static async putPublish(req, res) {
    const { id } = req.params;
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tokenKey = `auth_${token}`;
    const userId = await redisClient.get(tokenKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(id), userId: new ObjectId(userId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    file.isPublic = true;

    await dbClient.db.collection('files').updateOne({ _id: new ObjectId(id) }, { $set: { isPublic: true } });

    return res.status(200).json(file);
  }

  static async putUnpublish(req, res) {
    const { id } = req.params;
    const token = req.headers['x-token'];

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tokenKey = `auth_${token}`;
    const userId = await redisClient.get(tokenKey);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(id), userId: new ObjectId(userId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    file.isPublic = false;

    await dbClient.db.collection('files').updateOne({ _id: new ObjectId(id) }, { $set: { isPublic: false } });

    return res.status(200).json(file);
  }

  static async getFile(req, res) {
    const { id } = req.params;
    const token = req.headers['x-token'];

    const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(id) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file.isPublic) {
      if (!token) {
        return res.status(404).json({ error: 'Not found' });
      }

      const tokenKey = `auth_${token}`;
      const userId = await redisClient.get(tokenKey);

      if (!userId) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (file.userId.toString() !== userId.toString()) {
        return res.status(404).json({ error: 'Not found' });
      }
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    const localPath = file.localPath;
    fs.access(localPath, fs.constants.R_OK, (err) => {
      if (err) {
        return res.status(404).json({ error: 'Not found' });
      }

      return res.sendFile(localPath);
    });
  }
  
  static async getFile(req, res) {
    const { id } = req.params;
    const { size } = req.query;
    const token = req.headers['x-token'];
  
    const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(id) });
  
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }
  
    if (!file.isPublic) {
      if (!token) {
        return res.status(404).json({ error: 'Not found' });
      }
  
      const tokenKey = `auth_${token}`;
      const userId = await redisClient.get(tokenKey);
  
      if (!userId) {
        return res.status(404).json({ error: 'Not found' });
      }
  
      if (file.userId.toString() !== userId.toString()) {
        return res.status(404).json({ error: 'Not found' });
      }
    }
  
    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }
  
    let localPath = file.localPath;
    if (size) {
      localPath = `${localPath}_${size}`;
    }
  
    fs.access(localPath, fs.constants.R_OK, (err) => {
      if (err) {
        return res.status(404).json({ error: 'Not found' });
      }
  
      return res.sendFile(localPath);
    });
  }
}

module.exports = FilesController;
