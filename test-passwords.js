const bcrypt = require('bcryptjs');
const user = { password: '$2a$10$Q7lzq/nlu5tP8SSDb2TjPOb02V2WpTs03HUIaMXDoExFIdoOHO5vq' };
const passwords = ['Admin@123', 'admin123', 'admin', 'Admin@123!', 'Admin123', 'fahiomnuman87', '123456', 'password'];
passwords.forEach(p => {
  bcrypt.compare(p, user.password).then(valid => {
    if (valid) console.log('Valid password found:', p);
  }).catch(e => console.log('Error:', e.message));
});
