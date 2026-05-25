const { ServicesClient } = require('@google-cloud/run').v2;
const sgMail = require('@sendgrid/mail');
const axios = require('axios');

// Ensure that the following environment variables are set before deploying
// Also update the SEND_GRID_API_KEY to whatever name you give this in Google Cloud Secret Manager
const runClient = new ServicesClient();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.checkGtmUpdate = async (req, res) => {
  try {
    // Make sure these are created before deploying!
    const projectId = process.env.GCP_PROJECT_ID;
    const region = process.env.GCP_REGION;
    const serviceName = process.env.GTM_SERVICE_NAME;
    
    const servicePath = `projects/${projectId}/locations/${region}/services/${serviceName}`;
    
    // Get current deployed image digest from Cloud Run
    const [service] = await runClient.getService({ name: servicePath });
    const currentImage = service.template.containers[0].image;
    
    // Fetch the latest digest for the :stable tag from Google's Registry
    // Note: This API request fetches the token and manifest registry data for the image
    const registryUrl = `https://gcr.io/v2/cloud-tagging-10302018/gtm-cloud-image/manifests/stable`;
    const registryResponse = await axios.get(registryUrl, {
      headers: { 'Accept': 'application/vnd.docker.distribution.manifest.v2+json' }
    });
    const latestDigest = registryResponse.headers['docker-content-digest'];

    // Compare current deployed signature/digest with latest registry digest
    // Cloud Run appends the digest to the image string upon deployment
    if (!currentImage.includes(latestDigest)) {
      console.log('Update available! Sending notification email...');

      // Target URL for your approval Cloud function
      const approvalUrl = process.env.APPROVAL_FUNCTION_URL;

      const msg = {
        to: process.env.ADMIN_EMAIL,
        from: process.env.SENDER_EMAIL,
        subject: 'Action Required: Server-Side GTM Update Available',
        html: `
          <p>A new version of server-side GTM is available in the Google Registry.</p>
          <p><strong>Current Image:</strong> <code>${currentImage}</code></p>
          <p><strong>Latest Digest:</strong> <code>${latestDigest}</code></p>
          <br />
          <a href="${approvalUrl}" style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Approve & Deploy Update</a>
        `,
      };

      await sgMail.send(msg);
      return res.status(200).send('Update detected. Email notification sent.');
    }

    return res.status(200).send('sGTM is completely up to date.');
  } catch (error) {
    console.error('Error executing update check:', error);
    return res.status(500).send(error.toString());
  }
};