
const Bull = require('bull');

const fileQueue = new Bull('fileQueue');
const userQueue = new Bull('userQueue');

module.exports = {
  fileQueue,
  userQueue,
};
