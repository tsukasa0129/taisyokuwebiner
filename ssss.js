import express from 'express';
const app = express();
const port = 3000;

// 静的ファイル配信の設定を追加
app.use(express.static('public'));

// 例：現在のサーバー時刻(UTC)を取得し、JST（UTC+9）へ変換
function getJstDate() {
    const now = new Date();
    // now はUTC時刻
    // getTime() + 9時間分(ミリ秒) = JSTのUnixTime
    const jstTime = now.getTime() + 9 * 60 * 60 * 1000;
    return new Date(jstTime);
}

// 毎時 55分 にスタートすると仮定
// 例： 10:55 がスタート → 10:00〜10:54 → 次のサイクル待ち or 前のサイクル終了
//                      → 10:55〜10:59 → スタートしてから 0〜4分経過
function getPlaybackOffsetMinute() {
    const jstNow = getJstDate();
    const currentMinutes = jstNow.getMinutes();  // 0〜59
    const currentSeconds = jstNow.getSeconds();

    console.log(currentMinutes);
  
    // スタート基準 = 55分
    // もし currentMinutes < 55 の場合 → ウェビナー始まってない、もしくは前サイクル終了中
    // もし currentMinutes >= 55 の場合 → (currentMinutes - 55) 分 経過
  
    let offsetMinutes = 0;
    let offsetSeconds = 0;
    if (currentMinutes >= 55) {
      offsetMinutes = currentMinutes - 55;
      offsetSeconds = currentSeconds; 
    } 
    if (currentMinutes < 35 && currentMinutes >= 0) {
      offsetMinutes = 5 + currentMinutes;
      offsetSeconds = currentSeconds;
    }
    // 上記以外（< 55）の場合、ウェビナーはまだ再生開始前という扱いでもOK
    // → offsetMinutes = 0 にしておけば、"開始前の待機画面" など演出できる
  
    return { offsetMinutes, offsetSeconds };
}

app.get('/', (req, res) => {
    const { offsetMinutes, offsetSeconds } = getPlaybackOffsetMinute();
  
    // 1分 = 60秒
    const totalOffsetSeconds = offsetMinutes * 60 + offsetSeconds;
  
    // 例として、フロント側のHTMLに埋め込む
    const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>セミナー視聴ページ</title>
    <style>
      #player video {
          width: 90%;
          display: block;
          margin: 0 auto;
      }
      #muteButton {
          width: 60%;
          padding: 10px 20px;
          margin: 10px auto; /* 真ん中に配置 */
          display: block; /* 真ん中に配置 */
          cursor: pointer;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          text-align: center;
          font-size: 40px;
      }

      .controls {
          width: 60%;
          padding: 10px 20px;
          margin: 35px auto; /* 真ん中に配置 */
          display: flex;
          flex-direction: row;
          cursor: pointer;
          color: white;
          border: none;
          border-radius: 4px;
          justify-content: center;
          
      }
      .controls p {
        margin: 0 10px;
        color: black;
        font-size: 30px;
      }
      .controls input {
        width: 40%;
        margin: 0 10px;
      }
      img {
        width: 100%;
      }
    </style>
    </head>
    <body>
    <img src="https://utagesystem.s3.ap-northeast-1.amazonaws.com/XDMBNMc2b2jM/3AYEeYzseNKH/R0bfOvEFqx8rkXEoU1HxkfhTrbzLmCYNGZ6ycF6L.png" alt="サムネイル">
    <div id="player"></div>
    <div class="controls">
      <p>音量調節バー：</p>
      <input type="range" class="volume-control" min="0" max="1" step="0.01" value="0.5">
    </div>
    <button id="muteButton">音声をオンにする</button>
    <script>
      // クッキーを利用して、2回目以降の訪問者は1回目から30分以上経っていたらページを見れないようにする
      document.addEventListener('DOMContentLoaded', function() {
          const thirtyMinutes = 30 * 60 * 1000; // 30分をミリ秒に変換
          const lastVisit = getCookie('lastVisit');
          const now = new Date().getTime();

          if (lastVisit && (now - lastVisit) > thirtyMinutes) {
              document.body.innerHTML = '<h1>このページは閲覧できません</h1>';
          } else {
              setCookie('lastVisit', now, 365);
          }
      });

      function setCookie(name, value, days) {
          const date = new Date();
          date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
          const expires = "expires=" + date.toUTCString();
          document.cookie = name + "=" + value + ";" + expires + ";path=/";
      }

      function getCookie(name) {
          const nameEQ = name + "=";
          const ca = document.cookie.split(';');
          for (let i = 0; i < ca.length; i++) {
              let c = ca[i];
              while (c.charAt(0) == ' ') {
                  c = c.substring(1, c.length);
              }
              if (c.indexOf(nameEQ) == 0) {
                  return c.substring(nameEQ.length, c.length);
              }
          }
          return null;
      }
      // Node.js側で計算した "経過秒" を受け取る
      const offset = ${totalOffsetSeconds};
      console.log("offset",offset);
      // 仮: 動画の合計長さ(秒)を 1800秒(=30分) と想定
      const videoLengthSeconds = 2100;
  
      // もし offset が videoLengthSeconds を超えていたら (前のサイクルが終わっている)
      // → サムネイルを表示する
      if (offset >= videoLengthSeconds || offset == 0) {
        // サムネイル or 終了画面
        document.getElementById('player').innerHTML = '<img src="https://utagesystem.s3.ap-northeast-1.amazonaws.com/XDMBNMc2b2jM/5ep80gCNwbJD/wrFxOptSIc4S19Zl6LXNU3cVmNvldcEN34vvJspg.png" alt="サムネイル">';
      } else {
        // まだ動画再生中 → offset から再生開始
        // ここで埋め込みプレーヤーを制御する
        const videoElement = document.createElement('video');
        videoElement.src = 'https://utagesystem.s3.ap-northeast-1.wasabisys.com/XDMBNMc2b2jM/sBzxq0VFvUsr.mp4'; // 動画ファイルのパス

        document.addEventListener('DOMContentLoaded', function() {
            const videoElement = document.querySelector('#player video');
            const muteButton = document.getElementById('muteButton');

            videoElement.removeAttribute('controls');
            videoElement.muted = true;
            videoElement.play()
                .catch(function(error) {
                    console.log("自動再生エラー:", error);
                });

            videoElement.currentTime = offset;

            const volumeControl = document.querySelector('.volume-control');
            volumeControl.value = videoElement.volume;
            volumeControl.addEventListener('input', function() {
                videoElement.volume = volumeControl.value;
            });

            muteButton.addEventListener('click', function() {
                videoElement.muted = !videoElement.muted;
                muteButton.textContent = videoElement.muted ? '音声をオンにする' : '音声をオフにする';
                muteButton.style.backgroundColor = videoElement.muted ? '#4CAF50' : 'blue';
            });
        });

        videoElement.addEventListener('ended', function() {
          // 動画が終了したらサムネイル表示に切り替え
          document.getElementById('player').innerHTML = '<img src="https://utagesystem.s3.ap-northeast-1.amazonaws.com/XDMBNMc2b2jM/5ep80gCNwbJD/wrFxOptSIc4S19Zl6LXNU3cVmNvldcEN34vvJspg.png" alt="サムネイル">';
        });

        document.getElementById('player').appendChild(videoElement);
      }
    </script>
  </body>
  </html>
    `;
    res.send(html);
});

app.listen(port, () => {
    console.log(`サーバーがポート${port}で起動しました`);
    console.log(`http://localhost:${port}`);
});