const SibApiV3Sdk = require('@getbrevo/brevo');

const apiInstance = new SibApiV3Sdk.ContactsApi();
apiInstance.setApiKey(SibApiV3Sdk.ContactsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

// Add a contact to Brevo list
// listId 2 = default "MySouqify Users" list (will be created if not exists)
const addContact = async ({ email, firstName, attributes = {} }) => {
  try {
    const contact = new SibApiV3Sdk.CreateContact();
    contact.email = email;
    contact.attributes = { FIRSTNAME: firstName, ...attributes };
    contact.listIds = [2];
    contact.updateEnabled = true; // update if already exists
    await apiInstance.createContact(contact);
    return true;
  } catch (err) {
    // Don't throw — email marketing failure should not block main flow
    console.error('Brevo addContact error:', err?.response?.body || err.message);
    return false;
  }
};

// Add subscriber from newsletter form (no name)
const addSubscriber = async (email) => {
  try {
    const contact = new SibApiV3Sdk.CreateContact();
    contact.email = email;
    contact.listIds = [3]; // separate "Newsletter" list
    contact.updateEnabled = true;
    await apiInstance.createContact(contact);
    return true;
  } catch (err) {
    console.error('Brevo addSubscriber error:', err?.response?.body || err.message);
    return false;
  }
};

module.exports = { addContact, addSubscriber };
