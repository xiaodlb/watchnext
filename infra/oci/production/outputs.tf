output "production_public_ip" {
  description = "Reserved public IPv4 address of the independent production VM."
  value       = oci_core_public_ip.production.ip_address
}

output "production_https_origin" {
  description = "HTTPS address provided through sslip.io until a custom domain is configured."
  value       = "https://${local.production_domain}"
}

output "production_ssh_command" {
  description = "Command template; replace the key path with the private key paired with ssh_public_key."
  value       = "ssh -i <private-key-path> ubuntu@${oci_core_public_ip.production.ip_address}"
}

output "production_instance_ocid" {
  description = "Instance OCID required when configuring the production GitHub Actions OCI deployment target."
  value       = oci_core_instance.production.id
}
