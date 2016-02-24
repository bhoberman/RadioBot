import youtube_dl
import sys


#TODO: Add code to print out if there is an error or something
class MyLogger(object):
    def debug(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        print(msg)


def my_hook(d):
    if d['status'] == 'finished':
        print('Success')


ydl_opts = {
    'format': 'bestaudio',
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'mp3',
    }],
    'logger': MyLogger(),
    'progress_hooks': [my_hook],
    'outtmpl': sys.argv[1]
}

print("THIS IS THE ARGV")
print(sys.argv)

with youtube_dl.YoutubeDL(ydl_opts) as ydl:
    ydl.download(sys.argv[2:])

print(sys.argv)