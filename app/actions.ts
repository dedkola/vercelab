"use server";

import {
  createAndDeployFromForm,
  fetchDeploymentFromGitById,
  redeployDeploymentById,
  removeDeploymentById,
  stopDeploymentById,
  updateDeploymentSettingsById,
} from "@/lib/deployment-engine";

export type DeploymentActionResult = {
  message: string;
  status: "success" | "error";
};

function getRequiredFormValue(formData: FormData, name: string): string {
  const value = formData.get(name);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${name}`);
  }

  return value;
}

function getActionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unexpected deployment error.";
}

function createActionResult(
  status: DeploymentActionResult["status"],
  message: string,
): DeploymentActionResult {
  return {
    message,
    status,
  };
}

export async function createDeploymentAction(formData: FormData) {
  try {
    const deployment = await createAndDeployFromForm({
      repositoryUrl: getRequiredFormValue(formData, "repositoryUrl"),
      githubToken: formData.get("githubToken"),
      branch: formData.get("branch"),
      serviceName: formData.get("serviceName"),
      appName: getRequiredFormValue(formData, "appName"),
      subdomain: getRequiredFormValue(formData, "subdomain"),
      port: getRequiredFormValue(formData, "port"),
      envVariables: formData.get("envVariables"),
    });
    return createActionResult(
      "success",
      `Deployment live at https://${deployment.domain}`,
    );
  } catch (error) {
    return createActionResult("error", getActionErrorMessage(error));
  }
}

export async function redeployDeploymentAction(
  formData: FormData,
): Promise<DeploymentActionResult> {
  const deploymentId = getRequiredFormValue(formData, "deploymentId");

  try {
    const result = await redeployDeploymentById(deploymentId);
    return createActionResult(
      "success",
      `Redeployed ${result.appName} to https://${result.domain}`,
    );
  } catch (error) {
    return createActionResult("error", getActionErrorMessage(error));
  }
}

export async function fetchDeploymentFromGitAction(
  formData: FormData,
): Promise<DeploymentActionResult> {
  const deploymentId = getRequiredFormValue(formData, "deploymentId");

  try {
    const result = await fetchDeploymentFromGitById(deploymentId);
    return createActionResult(
      "success",
      `Fetched latest changes for ${result.appName} at https://${result.domain}`,
    );
  } catch (error) {
    return createActionResult("error", getActionErrorMessage(error));
  }
}

export async function stopDeploymentAction(
  formData: FormData,
): Promise<DeploymentActionResult> {
  const deploymentId = getRequiredFormValue(formData, "deploymentId");

  try {
    const result = await stopDeploymentById(deploymentId);
    return createActionResult("success", `Stopped ${result.appName}.`);
  } catch (error) {
    return createActionResult("error", getActionErrorMessage(error));
  }
}

export async function removeDeploymentAction(
  formData: FormData,
): Promise<DeploymentActionResult> {
  const deploymentId = getRequiredFormValue(formData, "deploymentId");

  try {
    const result = await removeDeploymentById(deploymentId);
    return createActionResult("success", `Removed ${result.appName}.`);
  } catch (error) {
    return createActionResult("error", getActionErrorMessage(error));
  }
}

export async function updateDeploymentAction(
  formData: FormData,
): Promise<DeploymentActionResult> {
  try {
    const result = await updateDeploymentSettingsById({
      deploymentId: getRequiredFormValue(formData, "deploymentId"),
      appName: getRequiredFormValue(formData, "appName"),
      subdomain: getRequiredFormValue(formData, "subdomain"),
      port: getRequiredFormValue(formData, "port"),
      envVariables: formData.get("envVariables"),
    });
    return createActionResult(
      "success",
      `Updated ${result.appName}. Deployment live at https://${result.domain}`,
    );
  } catch (error) {
    return createActionResult("error", getActionErrorMessage(error));
  }
}
