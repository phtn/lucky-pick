curl \
  'https://youtube.googleapis.com/youtube/v3/search?key=AIzaSyB7_kQRQwA86YwP3OJddE8p37CXY4Lz6e4&q=PCSOGOVPHOfficial&part=snippet&type=video&maxResults=2' \
  --header 'Accept: application/json'

curl \
    'https://youtube.googleapis.com/youtube/v3/search?part=snippet&eventType=live&maxResults=2&q=Raptoria&type=video&key=AIzaSyB7_kQRQwA86YwP3OJddE8p37CXY4Lz6e4' \
    --header 'Accept: application/json' \
    --compressed
