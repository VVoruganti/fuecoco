// You'll need to replace these with your own values
const clientId = 'YOUR_CLIENT_ID';
const redirectUri = 'YOUR_REDIRECT_URI';

// Function to get the access token
async function getAccessToken(code) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    })
  });
  const data = await response.json();
  return data.access_token;
}

// Function to get liked songs
async function getLikedSongs(accessToken) {
  let allTracks = [];
  let url = 'https://api.spotify.com/v1/me/tracks?limit=50';

  while (url) {
    const response = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    const data = await response.json();
    allTracks = allTracks.concat(data.items);
    url = data.next;
  }
  return allTracks;
}

// Function to get all unique tracks from an artist
async function getArtistTracks(accessToken, artistId) {
  let allTracks = new Set();
  let url = `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=50`;

  while (url) {
    const albumsResponse = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    const albumsData = await albumsResponse.json();

    for (let album of albumsData.items) {
      let tracksUrl = `https://api.spotify.com/v1/albums/${album.id}/tracks`;
      while (tracksUrl) {
        const tracksResponse = await fetch(tracksUrl, {
          headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        const tracksData = await tracksResponse.json();
        for (let track of tracksData.items) {
          // Use a combination of name and duration to identify unique tracks
          const trackIdentifier = `${track.name}|${track.duration_ms}`;
          if (!allTracks.has(trackIdentifier)) {
            allTracks.add(trackIdentifier);
            track.uniqueIdentifier = trackIdentifier;
          }
        }
        tracksUrl = tracksData.next;
      }
    }

    url = albumsData.next;
  }
  return Array.from(allTracks).map(identifier => {
    const [name, duration] = identifier.split('|');
    return { name, duration_ms: parseInt(duration), uniqueIdentifier: identifier };
  });
}

// Helper function to remove duplicates from an array of tracks
function removeDuplicateTracks(tracks) {
  const uniqueTracks = new Map();
  for (const track of tracks) {
    if (!uniqueTracks.has(track.uniqueIdentifier)) {
      uniqueTracks.set(track.uniqueIdentifier, track);
    }
  }
  return Array.from(uniqueTracks.values());
}

// Function to create a playlist
async function createPlaylist(accessToken, userId, name) {
  const response = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: name,
      public: false
    })
  });
  return await response.json();
}

// Function to add tracks to a playlist
async function addTracksToPlaylist(accessToken, playlistId, trackUris) {
  for (let i = 0; i < trackUris.length; i += 100) {
    const chunk = trackUris.slice(i, i + 100);
    await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uris: chunk
      })
    });
  }
}

// Main function to tie it all together
async function createPlaylistFromLikedArtists() {
  // Get the authorization code from the URL (you need to implement the auth flow)
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');

  if (!code) {
    // Redirect to Spotify authorization page
    const scopes = 'user-library-read playlist-modify-private';
    window.location.href = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
    return;
  }

  const accessToken = await getAccessToken(code);
  const likedSongs = await getLikedSongs(accessToken);

  const artists = new Set(likedSongs.map(track => track.track.artists[0].id));
  const likedTrackIds = new Set(likedSongs.map(track => track.track.id));

  let allArtistTracks = [];
  for (let artistId of artists) {
    const artistTracks = await getArtistTracks(accessToken, artistId);
    allArtistTracks = allArtistTracks.concat(artistTracks);
  }

  // Remove duplicates
  const uniqueArtistTracks = removeDuplicateTracks(allArtistTracks);

  const newTrackUris = uniqueArtistTracks
    .filter(track => !likedTrackIds.has(track.id))
    .map(track => track.uri);

  const userResponse = await fetch('https://api.spotify.com/v1/me', {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  const userData = await userResponse.json();

  const playlist = await createPlaylist(accessToken, userData.id, "All Songs from Liked Artists");
  await addTracksToPlaylist(accessToken, playlist.id, newTrackUris);

  console.log(`Playlist created with ${newTrackUris.length} songs!`);
}

// Run the main function
createPlaylistFromLikedArtists().catch(console.error);
