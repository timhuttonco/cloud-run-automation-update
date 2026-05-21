const { ServicesClient } = require('@google-cloud/run').v2;
const runClient = new ServicesClient();

exports.autoUpdateGtm = async (req, res) => {
  try {
    // Your relevant Google Cloud variables - ensure that these are configured before deploying!
    const projectId = process.env.GCP_PROJECT_ID;
    const region = process.env.GCP_REGION;
    const serviceName = process.env.GTM_SERVICE_NAME;

    // Ensure project ID is updated to the correct value for your environment
    const name = `projects/${projectId}/locations/${region}/services/${serviceName}`;
    
    // Fetch current Cloud Run configurations
    console.log(`Fetching service configuration for ${serviceName}...`);
    const [service] = await runClient.getService({ name });
    
    // Inject a timestamp to invalidate the container configuration cache.
    // This forces Cloud Run to pull down a fresh slice of the ":stable" tag image.
    service.template.metadata = service.template.metadata || {};
    service.template.metadata.annotations = service.template.metadata.annotations || {};
    service.template.metadata.annotations['client.knative.dev/user-image'] = `gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable?update=${Date.now()}`;

    // Push configuration update to GCP
    console.log('Initiating rolling update deployment...');
    const [operation] = await runClient.updateService({ service });
    
    // Wait for deployment completion
    await operation.promise();
    
    console.log('Server-side GTM updated smoothly to the newest stable release!');
    return res.status(200).send('sGTM successfully updated.');
  } catch (error) {
    console.error('Failed to auto-update sGTM:', error);
    return res.status(500).send(`Auto-update failed: ${error.message}`);
  }
};