import youtube_dl
import sys


class Logger(object):
    def debug(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        print(msg)


def hook(d):
    if d['status'] == 'finished':
        print('Success')


ydl_opts = {
    'format': 'bestaudio',
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'mp3',
    }],
    'logger': Logger(),
    'progress_hooks': [hook],
    'outtmpl': sys.argv[1]
}

with youtube_dl.YoutubeDL(ydl_opts) as ydl:
    ydl.download(sys.argv[2:])