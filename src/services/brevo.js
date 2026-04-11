const https = require('https');

const BREVO_API_KEY = process.env.BREVO_API_KEY;

const brevoRequest = (method, path, body) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'api.brevo.com',
      path,
      method,
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

// Add a contact to Brevo (listId 2 = MySouqify Users)
const addContact = async ({ email, firstName, attributes = {} }) => {
  if (!BREVO_API_KEY) return false;
  try {
    const res = await brevoRequest('POST', '/v3/contacts', {
      email,
      attributes: { FIRSTNAME: firstName, ...attributes },
      listIds: [2],
      updateEnabled: true,
    });
    return res.status === 201 || res.status === 204;
  } catch (err) {
    console.error('Brevo addContact error:', err.message);
    return false;
  }
};

// Add newsletter subscriber (listId 3 = Newsletter)
const addSubscriber = async (email) => {
  if (!BREVO_API_KEY) return false;
  try {
    const res = await brevoRequest('POST', '/v3/contacts', {
      email,
      listIds: [3],
      updateEnabled: true,
    });
    return res.status === 201 || res.status === 204;
  } catch (err) {
    console.error('Brevo addSubscriber error:', err.message);
    return false;
  }
};

module.exports = { addContact, addSubscriber };
