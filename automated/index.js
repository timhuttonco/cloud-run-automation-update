const { ServicesClient } = require('@google-cloud/run').v2;
const runClient = new ServicesClient();

exports.autoUpdateGtm = async (req, res) => {
  try {
    // Your relevant Google Cloud variables - ensure that these are configured before deploying!
    const projectId = process.env.GCP_PROJECT_ID;
    const region = process.env.GCP_REGION;
    const serviceName = process.env.GTM_SERVICE_NAME;

    // Construct the resource identifier required by the GCP API
    const name = `projects/${projectId}/locations/${region}/services/${serviceName}`;
    
    // Fetch current Cloud Run configurations
    console.log(`[sGTM Bot] Fetching current service configuration for: ${serviceName}...`);
    const [service] = await runClient.getService({ name });
    
    // Ensure the nested metadata maps exist in the configuration tree to prevent undefined reference errors
    service.template = service.template || {};
    service.template.metadata = service.template.metadata || {};
    service.template.metadata.annotations = service.template.metadata.annotations || {};
    
    // Inject a timestamp to invalidate the container configuration cache.
    // This forces Cloud Run to pull down a fresh slice of the ":stable" tag image.
    const cacheBusterUri = `gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable?update=${Date.now()}`;
    service.template.metadata.annotations['client.knative.dev/user-image'] = cacheBusterUri;

    // Push configuration update to GCP
    console.log('[sGTM Bot] Initiating zero-downtime rolling update deployment...');
    const [operation] = await runClient.updateService({ service });
    
    // Wait for deployment completion
    await operation.promise();
    
    console.log('[sGTM Bot] Server-side GTM updated smoothly to the newest stable release!');
    return res.status(200).send('sGTM successfully updated.');
  } catch (error) {
    // Log errors directly to Google Cloud Logging for alerts and troubleshooting
    console.error('[sGTM Bot] CRITICAL: Failed to auto-update sGTM:', error);
    return res.status(500).send(`Auto-update failed: ${error.message}`);
  }
};