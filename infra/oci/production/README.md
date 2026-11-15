# WatchNext production infrastructure

This Terraform root creates an independent Oracle Cloud production environment. It does not import, modify or destroy the manually created dev VM. Production has a separate VCN (`10.20.0.0/16`), public subnet, reserved public IP, A1 ARM VM, Docker Compose project (`watchnext-production`) and therefore separate PostgreSQL and Caddy Docker volumes.

Production starts with an empty PostgreSQL database. It uses the public `sslip.io` hostname calculated from its reserved IPv4 address, so Caddy can obtain HTTPS without a purchased domain. Use a custom DNS name later by updating the production `.env` and redeploying.

## Prerequisites

Install Terraform 1.6+ and the OCI CLI, then authenticate both using an OCI CLI/API-key profile. Terraform uses the OCI provider to create resources; the OCI CLI attaches the reserved address to the new VM after its primary VNIC exists. Never commit API private keys, a Terraform state file or a filled-in variable file. The Terraform state contains sensitive configuration such as the database password, so keep it in a protected backend before applying for real use.

The current Always Free footprint is one dev VM with 1 OCPU and 6 GB RAM. The defaults here create production with one more OCPU and 6 GB RAM, reaching the stated A1 Always Free limit of 2 OCPUs and 12 GB. Capacity can still be unavailable in an availability domain.

## Plan and apply

Create a private variable file outside Git using `production.tfvars.example`, set the administrator's current public IP with `/32`, and pass the database password from a secret shell variable:

```sh
cd infra/oci/production
terraform init
terraform fmt -check
terraform validate
TF_VAR_database_password='a-new-production-only-secret' terraform plan -var-file=/secure/path/production.tfvars
TF_VAR_database_password='a-new-production-only-secret' terraform apply -var-file=/secure/path/production.tfvars
```

`terraform apply` creates a public VM and allows ports 80/443 from the internet plus SSH from `admin_cidr`; inspect the plan immediately before applying. Ports 5432 and 8100 are absent from the ingress rules.

The output gives the IP, temporary HTTPS origin, SSH command and instance OCID. On first boot cloud-init installs Docker, clones the requested branch and starts the application. Initial image build can take several minutes. Check it with:

```sh
curl --fail https://<production-origin-host>/health/readyz
```

## Update and destroy

Production and dev are separate. Deploy updates to production through its own GitHub Actions variables and OCI Run Command identity after the instance OCID is known; do not reuse the dev target variables.

To remove only this production environment, run the destroy command from this directory with the same protected state and variables. This deletes the VM, reserved IP and network. Its production database volume is deleted with the VM and cannot be recovered unless you back it up first.

```sh
TF_VAR_database_password='a-new-production-only-secret' terraform destroy -var-file=/secure/path/production.tfvars
```
