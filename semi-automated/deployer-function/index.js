const { ServicesClient } = require('@google-cloud/run').v2;

// This client automatically uses the service account credentials attached to this Cloud Function.
const runClient = new ServicesClient();

/**
 * Triggered by HTTP GET/POST (via the link in your notification email).
 * Instructs Cloud Run to fetch the latest sGTM image and deploy a new revision.
 */
exports.deployGtmUpdate = async (req, res) => {
  try {
    // Construct the fully qualified resource name for your Cloud Run service.
    const name = `projects/${process.env.GCP_PROJECT_ID}/locations/${process.env.GCP_REGION}/services/${process.env.GTM_SERVICE_NAME}`;
    
    console.log(`[sGTM Bot] Fetching current configuration for service: ${name}`);
    
    // Fetch the existing live configuration of your Cloud Run service.
    // runClient.getService returns an array where the first element is the Service object.
    const [service] = await runClient.getService({ name });
    
    // Ensure the nested metadata and annotation objects exist to avoid "undefined" errors.
    service.template = service.template || {};
    service.template.metadata = service.template.metadata || {};
    service.template.metadata.annotations = service.template.metadata.annotations || {};
    
    // Cloud Run normally won't redeploy if the image tag text string doesn't change.
    // By appending `?update=${Date.now()}` (e.g., ?update=1716300000000), we modify the configuration text.
    // This tells Cloud Run: "Something is different, go pull a fresh copy of ':stable' from the registry."
    const cacheBusterUri = `gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable?update=${Date.now()}`;
    service.template.metadata.annotations['client.knative.dev/user-image'] = cacheBusterUri;
    
    console.log(`[sGTM Bot] Modifying configuration with cache-buster: ${cacheBusterUri}`);
    console.log('[sGTM Bot] Sending update request to Cloud Run API...');

    // Submit the updated configuration back to the Cloud Run API.
    // This is an asynchronous operation. GCP starts spinning up the new containers in the background.
    const [operation] = await runClient.updateService({ service });
    
    // The API call returns a "Long-Running Operation" object. We call .promise() to pause execution
    // of this function until the Cloud Run deployment completely finishes (or fails).
    await operation.promise(); 
    
    console.log('[sGTM Bot] Cloud Run deployment completed successfully.');
    
    // Success Response: This HTML is what you will see in your browser tab when you click the email link.
    res.status(200).send(`
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; text-align: center; border: 1px solid #d4edda; padding: 20px; border-radius: 8px; background-color: #d4edda; color: #155724;">
        <h1 style="margin-top: 0;">Deployment Success!</h1>
        <p>Your server-side GTM instance has been successfully updated to the latest stable version via a rolling update.</p>
      </div>
    `);

  } catch (error) {
    // Error Handling: Log the full error to GCP Cloud Logging for debugging, and show a failure screen.
    console.error('[sGTM Bot] CRITICAL: Deployment failed:', error);
    
    res.status(500).send(`
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; text-align: center; border: 1px solid #f8d7da; padding: 20px; border-radius: 8px; background-color: #f8d7da; color: #721c24;">
        <h1 style="margin-top: 0;">Deployment Failed</h1>
        <p>An error occurred while updating your sGTM instance. Check GCP Logging for more information.</p>
        <pre style="text-align: left; background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto;">${error.message}</pre>
      </div>
    `);
  }
};