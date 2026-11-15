locals {
  prefix            = "watchnext-production"
  production_domain = "${local.prefix}.${oci_core_public_ip.production.ip_address}.sslip.io"
  production_env = join("\n", [
    "WATCHNEXT_DOMAIN=${local.production_domain}",
    "WATCHNEXT_APP_ORIGIN=https://${local.production_domain}",
    "WATCHNEXT_COMPOSE_DB_PASSWORD=${var.database_password}",
    "WATCHNEXT_COMPOSE_DB_USER=watchnext",
    "WATCHNEXT_COMPOSE_DB_NAME=watchnext",
    "WATCHNEXT_COMPOSE_PORT=8100",
  ])
  availability_domain = coalesce(
    var.availability_domain,
    data.oci_identity_availability_domains.available.availability_domains[0].name,
  )
}

data "oci_identity_availability_domains" "available" {
  compartment_id = var.compartment_id
}

data "oci_core_images" "ubuntu_arm" {
  compartment_id           = var.compartment_id
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04 Minimal aarch64"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_vcn" "production" {
  compartment_id = var.compartment_id
  display_name   = "${local.prefix}-vcn"
  dns_label      = "watchnextprod"
  cidr_blocks    = ["10.20.0.0/16"]
}

resource "oci_core_internet_gateway" "production" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.production.id
  display_name   = "${local.prefix}-internet-gateway"
  enabled        = true
}

resource "oci_core_route_table" "production" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.production.id
  display_name   = "${local.prefix}-public-route-table"

  route_rules {
    network_entity_id = oci_core_internet_gateway.production.id
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
  }
}

resource "oci_core_security_list" "production" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.production.id
  display_name   = "${local.prefix}-public-security-list"

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }

  ingress_security_rules {
    protocol = "6"
    source   = var.admin_cidr
    tcp_options {
      min = 22
      max = 22
    }
  }

  dynamic "ingress_security_rules" {
    for_each = toset([80, 443])
    content {
      protocol = "6"
      source   = "0.0.0.0/0"
      tcp_options {
        min = ingress_security_rules.value
        max = ingress_security_rules.value
      }
    }
  }
}

resource "oci_core_subnet" "production_public" {
  compartment_id             = var.compartment_id
  vcn_id                     = oci_core_vcn.production.id
  display_name               = "${local.prefix}-public-subnet"
  cidr_block                 = "10.20.0.0/24"
  route_table_id             = oci_core_route_table.production.id
  security_list_ids          = [oci_core_security_list.production.id]
  prohibit_public_ip_on_vnic = true
  dns_label                  = "public"
}

resource "oci_core_public_ip" "production" {
  compartment_id = var.compartment_id
  display_name   = "${local.prefix}-public-ip"
  lifetime       = "RESERVED"
}

resource "oci_core_instance" "production" {
  availability_domain = local.availability_domain
  compartment_id      = var.compartment_id
  display_name        = local.prefix
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = var.shape_ocpus
    memory_in_gbs = var.shape_memory_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.production_public.id
    assign_public_ip = false
    hostname_label   = "watchnextprod"
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
      repository   = var.repository
      branch       = var.branch
      env_file_b64 = base64encode(local.production_env)
    }))
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu_arm.images[0].id
  }
}

data "oci_core_vnic_attachments" "production" {
  compartment_id = var.compartment_id
  instance_id    = oci_core_instance.production.id
}

data "oci_core_private_ips" "production" {
  vnic_id = data.oci_core_vnic_attachments.production.vnic_attachments[0].vnic_id
}

resource "terraform_data" "associate_reserved_ip" {
  input = data.oci_core_private_ips.production.private_ips[0].id

  provisioner "local-exec" {
    command = "oci network public-ip update --public-ip-id ${oci_core_public_ip.production.id} --private-ip-id ${data.oci_core_private_ips.production.private_ips[0].id} --force"
  }
}
