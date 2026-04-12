"use server";

import { redirect } from "next/navigation";

import {
  createAndDeployFromForm,
  redeployDeploymentById,
  removeDeploymentById,
  stopDeploymentById,
} from "@/lib/deployment-engine";

function getRequiredFormValue(formData: FormData, name: string): string {
  const value = formData.get(name);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${name}`);
  }

  return value;
}

function formatRedirectUrl(status: "success" | "error", message: string): string {
  return `/?status=${status}&message=${encodeURIComponent(message)}`;
}

function getActionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unexpected deployment error.";
}

export async function createDeploymentAction(formData: FormData) {
  let url: string;

  try {
    const deployment = await createAndDeployFromForm({
      repositoryUrl: getRequiredFormValue(formData, "repositoryUrl"),
      githubToken: formData.get("githubToken"),
      branch: formData.get("branch"),
      serviceName: formData.get("serviceName"),
      appName: getRequiredFormValue(formData, "appName"),
      subdomain: getRequiredFormValue(formData, "subdomain"),
      port: getRequiredFormValue(formData, "port"),
    });
    url = formatRedirectUrl(
      "success",
      `Deployment live at https://${deployment.domain}`,
    );
  } catch (error) {
    url = formatRedirectUrl("error", getActionErrorMessage(error));
  }

  redirect(url);
}

export async function redeployDeploymentAction(formData: FormData) {
  const deploymentId = getRequiredFormValue(formData, "deploymentId");
  let url: string;

  try {
    const result = await redeployDeploymentById(deploymentId);
    url = formatRedirectUrl(
      "success",
      `Redeployed ${result.appName} to https://${result.domain}`,
    );
  } catch (error) {
    url = formatRedirectUrl("error", getActionErrorMessage(error));
  }

  redirect(url);
}

export async function stopDeploymentAction(formData: FormData) {
  const deploymentId = getRequiredFormValue(formData, "deploymentId");
  let url: string;

  try {
    const result = await stopDeploymentById(deploymentId);
    url = formatRedirectUrl("success", `Stopped ${result.appName}.`);
  } catch (error) {
    url = formatRedirectUrl("error", getActionErrorMessage(error));
  }

  redirect(url);
}

export async function removeDeploymentAction(formData: FormData) {
  const deploymentId = getRequiredFormValue(formData, "deploymentId");
  let url: string;

  try {
    const result = await removeDeploymentById(deploymentId);
    url = formatRedirectUrl("success", `Removed ${result.appName}.`);
  } catch (error) {
    url = formatRedirectUrl("error", getActionErrorMessage(error));
  }

  redirect(url);
}
