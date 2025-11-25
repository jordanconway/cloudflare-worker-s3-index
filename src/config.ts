/**
 * Configuration for the S3 index generator worker
 */

export interface Env {
  // R2 Buckets
  DEST_BUCKET: R2Bucket;
  DEST_BUCKET_META_CDN: R2Bucket;

  // S3 Source Configuration
  SOURCE_S3_BUCKET: string;
  SOURCE_S3_REGION: string;

  // AWS Credentials (optional - use IAM role if not provided)
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
}

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface Config {
  prefixes: string[];
  packageAllowList: Set<string>;
  keepThreshold: number;
  acceptedFileExtensions: readonly string[];
  acceptedSubdirPatterns: RegExp[];
  sourceS3: S3Config;
  destR2Buckets: R2Bucket[];
}

// Default prefixes from manage.py
const DEFAULT_PREFIXES = [
  "whl",
  "whl/nightly",
  "whl/test",
  "libtorch",
  "libtorch/nightly",
  "whl/test/variant",
  "whl/variant",
  "whl/preview/forge",
];

// Package allow list from manage.py - 245+ packages
const PACKAGE_ALLOW_LIST_ARRAY = [
  // torchtune additional packages
  "aiohttp", "aiosignal", "aiohappyeyeballs", "antlr4_python3_runtime",
  "antlr4-python3-runtime", "async_timeout", "attrs", "blobfile", "datasets",
  "dill", "frozenlist", "huggingface_hub", "llnl_hatchet", "lxml", "multidict",
  "multiprocess", "omegaconf", "pandas", "psutil", "pyarrow", "pyarrow_hotfix",
  "pycryptodomex", "python_dateutil", "pytz", "pyyaml", "regex", "safetensors",
  "sentencepiece", "six", "tiktoken", "torchao", "torchao_nightly", "tzdata",
  "xxhash", "yarl", "pep_xxx_wheel_variants", "nvidia_variant_provider",
  // triton additional packages
  "arpeggio", "caliper_reader", "contourpy", "cycler", "fonttools",
  "kiwisolver", "llnl-hatchet", "matplotlib", "pydot", "pyparsing", "textx",
  "importlib_metadata", "importlib_resources", "zipp",
  // torch xpu additional packages
  "dpcpp_cpp_rt", "intel_cmplr_lib_rt", "intel_cmplr_lib_ur", "intel_cmplr_lic_rt",
  "intel_opencl_rt", "intel_sycl_rt", "intel_openmp", "tcmlib", "umf", "intel_pti",
  "oneccl_devel", "oneccl", "impi_rt", "onemkl_sycl_blas", "onemkl_sycl_dft",
  "onemkl_sycl_lapack", "onemkl_sycl_sparse", "onemkl_sycl_rng", "onemkl_license",
  // core packages
  "pillow", "certifi", "charset_normalizer", "cmake", "colorama", "cuda_bindings",
  "fbgemm_gpu", "fbgemm_gpu_genai", "filelock", "fsspec", "idna", "iopath",
  "jinja2", "lit", "lightning_utilities", "markupsafe", "mpmath", "mkl",
  "mypy_extensions", "nestedtensor", "networkx", "numpy",
  // nvidia cuda 11
  "nvidia_cublas_cu11", "nvidia_cuda_cupti_cu11", "nvidia_cuda_nvrtc_cu11",
  "nvidia_cuda_runtime_cu11", "nvidia_cudnn_cu11", "nvidia_cufft_cu11",
  "nvidia_curand_cu11", "nvidia_cusolver_cu11", "nvidia_cusparse_cu11",
  "nvidia_nccl_cu11", "nvidia_nvtx_cu11",
  // nvidia cuda 12
  "nvidia_cublas_cu12", "nvidia_cuda_cupti_cu12", "nvidia_cuda_nvrtc_cu12",
  "nvidia_cuda_runtime_cu12", "nvidia_cudnn_cu12", "nvidia_cufft_cu12",
  "nvidia_cufile_cu12", "nvidia_nvshmem_cu12", "nvidia_curand_cu12",
  "nvidia_cusolver_cu12", "nvidia_cusparse_cu12", "nvidia_cusparselt_cu12",
  "nvidia_nccl_cu12", "nvidia_nvtx_cu12", "nvidia_nvjitlink_cu12",
  // nvidia cuda 13
  "nvidia_cublas", "nvidia_cuda_cupti", "nvidia_cuda_nvrtc", "nvidia_cuda_runtime",
  "nvidia_cudnn_cu13", "nvidia_cufft", "nvidia_cufile", "nvidia_nvshmem_cu13",
  "nvidia_curand", "nvidia_cusolver", "nvidia_cusparse", "nvidia_cusparselt_cu13",
  "nvidia_nccl_cu13", "nvidia_nvtx", "nvidia_nvjitlink",
  // torch packages
  "packaging", "portalocker", "pyre_extensions", "pytorch_triton",
  "pytorch_triton_rocm", "pytorch_triton_xpu", "requests", "sympy", "tbb",
  "torch_no_python", "torch", "torch_tensorrt", "torcharrow", "torchaudio",
  "torchcodec", "torchcsprng", "torchdata", "torchdistx", "torchmetrics",
  "torchrec", "torchtext", "torchtune", "torchtitan", "torchvision", "torchcomms",
  "torchvision_extra_decoders", "triton", "tqdm", "typing_extensions",
  "typing_inspect", "urllib3", "xformers", "executorch", "setuptools",
  "setuptools_scm", "wheel",
  // vllm packages
  "ninja", "cuda_python", "cuda_pathfinder", "pynvml", "nvidia_ml_py", "einops",
  "nvidia_cudnn_frontend", "cachetools", "blake3", "py_cpuinfo", "transformers",
  "hf_xet", "tokenizers", "protobuf", "fastapi", "annotated_types", "anyio",
  "pydantic", "pydantic_core", "sniffio", "starlette", "typing_inspection",
  "openai", "distro", "h11", "httpcore", "httpx", "jiter", "prometheus_client",
  "prometheus_fastapi_instrumentator", "lm_format_enforcer", "interegular",
  "llguidance", "outlines_core", "diskcache", "lark", "xgrammar",
  "partial_json_parser", "pyzmq", "msgspec", "gguf", "mistral_common", "rpds_py",
  "pycountry", "referencing", "pydantic_extra_types", "jsonschema_specifications",
  "jsonschema", "opencv_python_headless", "compressed_tensors", "frozendict",
  "depyf", "astor", "cloudpickle", "watchfiles", "python_json_logger", "scipy",
  "pybase64", "cbor2", "setproctitle", "openai_harmony", "numba", "llvmlite",
  "ray", "click", "msgpack", "fastapi_cli", "fastapi_cloud_cli", "httptools",
  "markdown_it_py", "pygments", "python_dotenv", "rich", "rich_toolkit",
  "shellingham", "typer", "uvicorn", "uvloop", "websockets", "python_multipart",
  "email_validator", "dnspython", "mdurl", "rignore", "sentry_sdk",
  "cupy_cuda12x", "fastrlock", "soundfile", "cffi", "pycparser", "vllm",
  "flashinfer_python",
  // forge additional packages
  "absl_py", "docker", "docstring_parser", "exceptiongroup", "torchforge",
  "gitdb", "gitpython", "grpcio", "hf_transfer", "markdown", "monarch",
  "opentelemetry_api", "pip", "platformdirs", "propcache", "pygtrie", "shtab",
  "smmap", "soxr", "tabulate", "tensorboard", "tensorboard_data_server", "tomli",
  "torchshow", "torchstore", "torchx_nightly", "typeguard", "tyro", "wandb",
  "werkzeug",
];

export function loadConfig(env: Env): Config {
  // Validate required environment variables
  if (!env.SOURCE_S3_BUCKET) {
    throw new Error("SOURCE_S3_BUCKET environment variable is required");
  }
  if (!env.SOURCE_S3_REGION) {
    throw new Error("SOURCE_S3_REGION environment variable is required");
  }

  const sourceS3: S3Config = {
    bucket: env.SOURCE_S3_BUCKET,
    region: env.SOURCE_S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  };

  // Validate credentials: either both keys or neither (IAM role)
  const hasAccessKey = !!sourceS3.accessKeyId;
  const hasSecretKey = !!sourceS3.secretAccessKey;
  
  if (hasAccessKey !== hasSecretKey) {
    throw new Error(
      "Either provide both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither (for IAM role)"
    );
  }

  return {
    prefixes: DEFAULT_PREFIXES,
    packageAllowList: new Set(PACKAGE_ALLOW_LIST_ARRAY.map((p) => p.toLowerCase())),
    keepThreshold: 60,
    acceptedFileExtensions: ["whl", "zip", "tar.gz", "json"] as const,
    acceptedSubdirPatterns: [
      /^cu[0-9]+$/,           // cuda: cu102, cu118, etc.
      /^rocm[0-9]+\.[0-9]+$/, // rocm: rocm5.4, rocm6.0, etc.
      /^cpu$/,                // cpu
      /^xpu$/,                // xpu
    ],
    sourceS3,
    destR2Buckets: [env.DEST_BUCKET, env.DEST_BUCKET_META_CDN],
  };
}
