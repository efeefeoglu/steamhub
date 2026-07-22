import pytest
from fastapi.testclient import TestClient
from api.index import app, is_valid_steam_url

client = TestClient(app)

def test_is_valid_steam_url():
    # Valid
    assert is_valid_steam_url("https://store.steampowered.com/category/trains") is True
    assert is_valid_steam_url("http://store.steampowered.com/sale/autumn2023") is True

    # Invalid domain
    assert is_valid_steam_url("https://www.google.com/category/trains") is False

    # Invalid path
    assert is_valid_steam_url("https://store.steampowered.com/app/12345") is False

    # Invalid scheme
    assert is_valid_steam_url("ftp://store.steampowered.com/category/trains") is False

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_extract_endpoint_invalid_url():
    response = client.post("/api/extract", json={"url": "https://invalid.com"})
    assert response.status_code == 400

def test_details_endpoint_large_batch():
    app_ids = list(range(1, 25))
    response = client.post("/api/details", json={"app_ids": app_ids})
    assert response.status_code == 400
    assert "Batch size too large" in response.text

from api.index import _cache, get_from_cache, set_cache

def test_caching():
    _cache.clear()
    assert get_from_cache("test") is None
    set_cache("test", {"data": 123})
    assert get_from_cache("test") == {"data": 123}
