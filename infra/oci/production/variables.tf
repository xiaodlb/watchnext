variable "region" {
  description = "OCI region containing the independent production environment, for example me-dubai-1."
  type        = string
}

variable "compartment_id" {
  description = "OCID of the OCI compartment that owns the production resources."
  type        = string
}

variable "availability_domain" {
  description = "Optional availability-domain name. Leave null to use the first available domain."
  type        = string
  default     = null
  nullable    = true
}

variable "ssh_public_key" {
  description = "Public SSH key for the ubuntu account. Never put a private key here."
  type        = string
}

variable "admin_cidr" {
  description = "Single administrator CIDR allowed to SSH to production, for example 203.0.113.10/32."
  type        = string

  validation {
    condition     = can(cidrhost(var.admin_cidr, 0))
    error_message = "admin_cidr must be a valid IPv4 or IPv6 CIDR block."
  }
}

variable "database_password" {
  description = "New production PostgreSQL password. Supply it through TF_VAR_database_password or a protected tfvars file outside Git."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.database_password) >= 24 && !can(regex("[\\r\\n]", var.database_password))
    error_message = "database_password must contain at least 24 characters and no line breaks."
  }
}

variable "repository" {
  description = "Public Git repository cloned onto the VM during first boot."
  type        = string
  default     = "https://github.com/xiaodlb/watchnext.git"
}

variable "branch" {
  description = "Git branch deployed on the initial production VM."
  type        = string
  default     = "main"
}

variable "shape_ocpus" {
  description = "A1 Flex OCPUs. With the existing 1 OCPU dev VM, keep this at 1 to remain within the stated Always Free allowance."
  type        = number
  default     = 1

  validation {
    condition     = var.shape_ocpus >= 1 && var.shape_ocpus <= 2
    error_message = "shape_ocpus must be between 1 and 2."
  }
}

variable "shape_memory_gbs" {
  description = "A1 Flex memory in GB. With the existing 6 GB dev VM, keep this at 6 to remain within the stated Always Free allowance."
  type        = number
  default     = 6

  validation {
    condition     = var.shape_memory_gbs >= 6 && var.shape_memory_gbs <= 12
    error_message = "shape_memory_gbs must be between 6 and 12."
  }
}
