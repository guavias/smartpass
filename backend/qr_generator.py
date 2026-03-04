import os
import logging
from pathlib import Path
import qrcode
from qrcode.image.pure import PyPNGImage


logger = logging.getLogger(__name__)

# Create static directory if it doesn't exist
STATIC_DIR = Path(__file__).parent / "static" / "qr-codes"
STATIC_DIR.mkdir(parents=True, exist_ok=True)


class QRCodeGenerator:
    """Generate and store QR codes locally"""

    QR_SIZE = 250  # pixels
    QR_BORDER = 2  # quiet zone in boxes

    @staticmethod
    def generate_qr_code(qr_token: str) -> dict:
        """
        Generate a QR code and save it locally
        
        Args:
            qr_token: The token/data to encode in the QR code
            
        Returns:
            dict with filename and local path
        """
        try:
            filename = f"qr-{qr_token[:8]}.png"
            filepath = STATIC_DIR / filename
            
            # Generate QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=QRCodeGenerator.QR_BORDER,
            )
            qr.add_data(qr_token)
            qr.make(fit=True)
            
            # Create image
            img = qr.make_image(fill_color="black", back_color="white")
            
            # Save to static folder
            img.save(filepath)
            logger.info(f"QR code generated and saved: {filename}")
            
            return {
                "success": True,
                "filename": filename,
                "filepath": str(filepath),
            }
        
        except Exception as e:
            logger.error(f"Failed to generate QR code for token {qr_token}: {str(e)}")
            return {
                "success": False,
                "error": str(e),
            }

    @staticmethod
    def get_qr_url(filename: str, base_url: str = "http://localhost:8000") -> str:
        """
        Build the public URL for a QR code
        
        Args:
            filename: The QR code filename (e.g., "qr-abc123.png")
            base_url: The base URL of your server (e.g., from environment)
            
        Returns:
            Full URL to the QR code
        """
        return f"{base_url}/qr/{filename}"

    @staticmethod
    def generate_and_get_url(qr_token: str, base_url: str = "http://localhost:8000") -> dict:
        """
        Generate QR code and return its public URL
        
        Args:
            qr_token: The token to encode
            base_url: The base URL of your server
            
        Returns:
            dict with success status and QR URL
        """
        result = QRCodeGenerator.generate_qr_code(qr_token)
        
        if result["success"]:
            url = QRCodeGenerator.get_qr_url(result["filename"], base_url)
            return {
                "success": True,
                "filename": result["filename"],
                "qr_url": url,
            }
        else:
            return {
                "success": False,
                "error": result["error"],
            }

    @staticmethod
    def cleanup_qr_code(filename: str) -> dict:
        """
        Delete a QR code file (optional, for cleanup after expiration)
        
        Args:
            filename: The QR code filename to delete
            
        Returns:
            dict with success status
        """
        try:
            filepath = STATIC_DIR / filename
            if filepath.exists():
                filepath.unlink()
                logger.info(f"QR code deleted: {filename}")
                return {"success": True}
            else:
                logger.warning(f"QR code file not found: {filename}")
                return {"success": False, "error": "File not found"}
        
        except Exception as e:
            logger.error(f"Failed to delete QR code {filename}: {str(e)}")
            return {"success": False, "error": str(e)}
