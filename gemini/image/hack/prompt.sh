MODEL="gemini-3.1-pro-preview"
# MODEL="gemini-3.5-flash"
# MODEL="gemini-3-pro-preview"
# MODEL="gemini-2.5-flash"

pushd /usr/local/google/home/zicong/code/src/github.com/zicongmei/ai-coder/v2
go run  coder.go  \
    --file-list /usr/local/google/home/zicong/code/src/github.com/zicongmei/text2img/.hack/files.txt \
    --model ${MODEL}  \
    --inplace  \
    --prompt '
add a checkbox of whether to generate the images in batch. if not selected batch mode,
generate the images one by one

'
popd
