import ssl

from Crypto.Util.asn1 import DerSequence
from Crypto.PublicKey import RSA
from binascii import a2b_base64


def get_pubkey(pem):
    """ Extracts public key from x08 pem. """
    der = ssl.PEM_cert_to_DER_cert(pem)

    # Extract subjectPublicKeyInfo field from X.509 certificate (see RFC3280)
    cert = DerSequence()
    cert.decode(der)
    tbsCertificate = DerSequence()
    tbsCertificate.decode(cert[0])
    subjectPublicKeyInfo = tbsCertificate[6]

    return subjectPublicKeyInfo
