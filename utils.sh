#!/bin/bash
# set -e
REPO_DIR=$(pwd)

# Colors for terminal output
BOLD_YELLOW="\e[1;33m"
BOLD_GREEN="\e[1;32m"
BOLD_RED="\e[1;31m"
BOLD_BLUE="\e[1;34m"
BOLD_PURPLE="\e[1;35m"
RESET="\e[0m"

# Default version
VERSION="latest"

# Function to get default port mapping for an app
get_default_port() {
    local app_name=$1
    case "$app_name" in
        "academy")
            echo "3000:3000"
            ;;
        "frontend")
            echo "3000:3000"
            ;;
        "backend")
            echo "8000:8000"
            ;;
        "api")
            echo "8080:8080"
            ;;
        *)
            echo "3000:3000"  # fallback
            ;;
    esac
}

# Function to load environment variables from .env files
load_env_vars() {
    local app_path=$1
    local app_name=$(basename "$app_path")
    
    # Try to load from .env.local first, then .env
    if [[ -f "$app_path/.env.local" ]]; then
        echo -e "${BOLD_BLUE}📄 Loading environment from $app_path/.env.local${RESET}"
        set -a  # Mark variables for export
        source "$app_path/.env.local"
        set +a  # Stop marking variables for export
    elif [[ -f "$app_path/.env" ]]; then
        echo -e "${BOLD_BLUE}📄 Loading environment from $app_path/.env${RESET}"
        set -a
        source "$app_path/.env"
        set +a
    fi
    
    # Also try loading from project root
    if [[ -f ".env.local" ]]; then
        echo -e "${BOLD_BLUE}📄 Loading environment from ./.env.local${RESET}"
        set -a
        source ".env.local"
        set +a
    elif [[ -f ".env" ]]; then
        echo -e "${BOLD_BLUE}📄 Loading environment from ./.env${RESET}"
        set -a
        source ".env"
        set +a
    fi
}

# Function to check API keys and print status (separate from building args)
check_api_keys() {
    local app_name=$1
    
    if [[ "$app_name" == "academy" ]]; then
        local has_anthropic=false
        local has_openai=false
        
        if [[ -n "$ANTHROPIC_API_KEY" ]]; then
            echo -e "${BOLD_GREEN}✅ Anthropic API key configured${RESET}"
            has_anthropic=true
        else
            echo -e "${BOLD_YELLOW}⚠️  Anthropic API key not found (ANTHROPIC_API_KEY)${RESET}"
        fi
        
        if [[ -n "$OPENAI_API_KEY" ]]; then
            echo -e "${BOLD_GREEN}✅ OpenAI API key configured${RESET}"
            has_openai=true
        else
            echo -e "${BOLD_YELLOW}⚠️  OpenAI API key not found (OPENAI_API_KEY)${RESET}"
        fi
        
        # Warn if no API keys are available
        if [[ "$has_anthropic" == false && "$has_openai" == false ]]; then
            echo -e "${BOLD_RED}❌ Warning: No API keys found! Academy will not be able to generate AI responses.${RESET}"
            echo -e "${BOLD_YELLOW}   Please set ANTHROPIC_API_KEY and/or OPENAI_API_KEY environment variables${RESET}"
            echo -e "${BOLD_YELLOW}   or create a .env.local file with these keys.${RESET}"
        fi
    fi
}

# Function to build Docker environment arguments array (only outputs args, no status messages)
build_docker_env_args() {
    local app_name=$1
    
    case "$app_name" in
        "academy")
            echo "-e"
            echo "NODE_ENV=development"
            echo "-e"
            echo "NEXT_TELEMETRY_DISABLED=1"
            
            # Add API keys if available
            if [[ -n "$ANTHROPIC_API_KEY" ]]; then
                echo "-e"
                echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
            fi
            
            if [[ -n "$OPENAI_API_KEY" ]]; then
                echo "-e"
                echo "OPENAI_API_KEY=$OPENAI_API_KEY"
            fi
            ;;
        "backend"|"api")
            echo "-e"
            echo "NODE_ENV=development"
            # Add any backend-specific env vars here
            ;;
        *)
            echo "-e"
            echo "NODE_ENV=development"
            ;;
    esac
}

# Function to display usage
usage() {
    echo "Usage: $0 {build|run|build-run|stop|status} [--version VERSION] [--port PORT] [directories...]"
    echo ""
    echo "Commands:"
    echo "  build                Build Docker images"
    echo "  run                  Run containers from existing images"
    echo "  build-run            Build images and run containers (kills existing)"
    echo "  stop                 Stop and remove containers"
    echo "  status               Show running container status"
    echo ""
    echo "Options:"
    echo "  --version VERSION    Docker image version tag (default: latest)"
    echo "  --port PORT          Port mapping for run commands (e.g., 3000:3000)"
    echo ""
    echo "Environment Setup:"
    echo "  The script looks for .env.local or .env files in:"
    echo "  - The app directory (e.g., academy/.env.local)"
    echo "  - The project root (.env.local)"
    echo ""
    echo "  Required environment variables for Academy:"
    echo "  - ANTHROPIC_API_KEY  (for Claude integration)"
    echo "  - OPENAI_API_KEY     (for GPT integration)"
    echo ""
    echo "Examples:"
    echo "  $0 build academy                           # Build academy only"
    echo "  $0 run academy                             # Run academy container"
    echo "  $0 build-run academy                       # Build and run academy"
    echo "  $0 build-run --port 8080:3000 academy     # Build and run on port 8080"
    echo "  $0 stop academy                            # Stop academy container"
    echo "  $0 status                                  # Show running containers"
    echo ""
    echo "  # Set API keys directly:"
    echo "  ANTHROPIC_API_KEY=sk-... OPENAI_API_KEY=sk-... $0 build-run academy"
    exit 1
}

# Function to check if directory has Dockerfile
has_dockerfile() {
    local dir=$1
    [[ -f "$dir/Dockerfile" ]]
}

# Function to get container name from app name
get_container_name() {
    local app_name=$1
    echo "${app_name}-container"
}

# Function to get port mapping for an app
get_port_mapping() {
    local app_name=$1
    local custom_port=$2
    
    if [[ -n "$custom_port" ]]; then
        echo "$custom_port"
    else
        get_default_port "$app_name"
    fi
}

# Function to stop and remove container
stop_container() {
    local app_name=$1
    local container_name=$(get_container_name "$app_name")
    
    echo -e "${BOLD_PURPLE}🛑 Stopping existing containers for $app_name...${RESET}"
    
    # Check if container exists and is running
    if docker ps -q -f name="$container_name" | grep -q .; then
        echo "  Stopping running container: $container_name"
        docker stop "$container_name" >/dev/null 2>&1
    fi
    
    # Check if container exists (stopped)
    if docker ps -aq -f name="$container_name" | grep -q .; then
        echo "  Removing container: $container_name"
        docker rm "$container_name" >/dev/null 2>&1
    fi
    
    echo -e "${BOLD_GREEN}✅ Cleanup completed for $app_name${RESET}"
}

# Function to build Docker image
build_image() {
    eval $(minikube docker-env)
    local app_path=$1
    local app_name=$(basename "$app_path")
    
    echo -e "${BOLD_BLUE}📦 Processing: $app_name${RESET}"
    
    # Check if directory exists
    if [[ ! -d "$app_path" ]]; then
        echo -e "${BOLD_RED}❌ Directory $app_path does not exist. Skipping.${RESET}"
        return 1
    fi
    
    # Check if Dockerfile exists
    if ! has_dockerfile "$app_path"; then
        echo -e "${BOLD_RED}❌ No Dockerfile found in $app_path. Skipping.${RESET}"
        return 1
    fi
    
    echo -e "${BOLD_YELLOW}🔨 Building Docker image: $app_name:$VERSION${RESET}"
    
    # Build the Docker image
    if docker build -t "$app_name:$VERSION" "$app_path"; then
        echo -e "${BOLD_GREEN}✅ Successfully built $app_name:$VERSION${RESET}"
        return 0
    else
        echo -e "${BOLD_RED}❌ Failed to build $app_name:$VERSION${RESET}"
        return 1
    fi
}

# Function to run container
run_container() {
    eval $(minikube docker-env)
    local app_path=$1
    local port_mapping=$2
    local app_name=$(basename "$app_path")
    local container_name=$(get_container_name "$app_name")
    
    echo -e "${BOLD_YELLOW}🚀 Starting container: $app_name${RESET}"
    
    # Load environment variables
    load_env_vars "$app_path"
    
    # Check API keys and show status
    check_api_keys "$app_name"
    
    # Check if image exists
    if ! docker images -q "$app_name:$VERSION" | grep -q .; then
        echo -e "${BOLD_RED}❌ Image $app_name:$VERSION not found. Build it first.${RESET}"
        return 1
    fi
    
    # Validate port mapping
    if [[ -z "$port_mapping" ]]; then
        echo -e "${BOLD_RED}❌ Port mapping is empty for $app_name${RESET}"
        return 1
    fi
    
    echo "  Port mapping: $port_mapping"
    echo "  Container name: $container_name"
    
    # Build environment arguments array
    local -a env_args
    readarray -t env_args < <(build_docker_env_args "$app_name")
    
    echo "  Environment variables: ${#env_args[@]} arguments configured"
    
    # Debug: print the docker command (without showing sensitive values)
    echo "  Docker command: docker run -d --name $container_name -p $port_mapping [${#env_args[@]} env args] $app_name:$VERSION"
    
    # Run the container with proper argument handling
    if docker run -d \
        --name "$container_name" \
        -p "$port_mapping" \
        "${env_args[@]}" \
        "$app_name:$VERSION"; then
        
        local host_port="${port_mapping%%:*}"
        echo -e "${BOLD_GREEN}✅ Successfully started $container_name${RESET}"
        echo -e "${BOLD_BLUE}🌐 Access at: http://localhost:$host_port${RESET}"
        
        # Show helpful info for Academy
        if [[ "$app_name" == "academy" ]]; then
            echo -e "${BOLD_BLUE}📚 Academy-specific info:${RESET}"
            echo "  - Check the logs if you encounter issues: docker logs $container_name"
            echo "  - Shell access: docker exec -it $container_name sh"
        fi
        
        return 0
    else
        echo -e "${BOLD_RED}❌ Failed to start $container_name${RESET}"
        echo -e "${BOLD_YELLOW}💡 Debug: Try running 'docker logs $container_name' to see what went wrong${RESET}"
        return 1
    fi
}

# Function to build and run (with cleanup)
build_and_run() {
    local app_path=$1
    local port_mapping=$2
    local app_name=$(basename "$app_path")
    
    echo -e "${BOLD_PURPLE}🔄 Build-Run: $app_name${RESET}"
    
    # Stop existing container first
    stop_container "$app_name"
    
    # Build the image
    if build_image "$app_path"; then
        # Run the new container
        run_container "$app_path" "$port_mapping"
        return $?
    else
        return 1
    fi
}

# Function to get all directories with Dockerfiles
get_all_buildable_dirs() {
    local dirs=()
    for dir in */; do
        if [[ -d "$dir" ]] && has_dockerfile "$dir"; then
            dirs+=("${dir%/}")  # Remove trailing slash
        fi
    done
    echo "${dirs[@]}"
}

# Function to show running containers
show_status() {
    echo -e "${BOLD_BLUE}📊 Container Status:${RESET}"
    echo ""
    
    local found_containers=false
    
    # Get all containers with our naming pattern
    local running_containers=$(docker ps --filter "name=*-container" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null)
    
    if [[ -n "$running_containers" ]] && [[ "$running_containers" != "NAMES	STATUS	PORTS" ]]; then
        echo -e "${BOLD_GREEN}Running containers:${RESET}"
        echo "$running_containers"
        found_containers=true
        
        echo ""
        echo -e "${BOLD_BLUE}💡 Useful commands:${RESET}"
        echo "  View logs: docker logs <container-name>"
        echo "  Shell access: docker exec -it <container-name> sh"
        echo "  Stop all: $0 stop"
    fi
    
    if [[ "$found_containers" == false ]]; then
        echo -e "${BOLD_YELLOW}No containers currently running.${RESET}"
        echo ""
        echo -e "${BOLD_BLUE}💡 Start containers with:${RESET}"
        echo "  $0 build-run academy"
    fi
}

# Parse command line arguments
COMMAND=""
TARGET_DIRS=()
CUSTOM_PORT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        build|run|build-run|stop|status)
            COMMAND="$1"
            shift
            ;;
        --version)
            if [[ -n $2 ]] && [[ $2 != --* ]]; then
                VERSION="$2"
                shift 2
            else
                echo -e "${BOLD_RED}Error: --version requires a value${RESET}"
                usage
            fi
            ;;
        --port)
            if [[ -n $2 ]] && [[ $2 != --* ]]; then
                CUSTOM_PORT="$2"
                shift 2
            else
                echo -e "${BOLD_RED}Error: --port requires a value (e.g., 3000:3000)${RESET}"
                usage
            fi
            ;;
        -h|--help)
            usage
            ;;
        -*)
            echo -e "${BOLD_RED}Error: Unknown option $1${RESET}"
            usage
            ;;
        *)
            # This should be a directory name
            TARGET_DIRS+=("$1")
            shift
            ;;
    esac
done

# Validate command
if [[ -z "$COMMAND" ]]; then
    echo -e "${BOLD_RED}Error: No command specified${RESET}"
    usage
fi

# Special handling for status command
if [[ "$COMMAND" == "status" ]]; then
    show_status
    exit 0
fi

# Main execution
case "$COMMAND" in
    build)
        echo -e "${BOLD_YELLOW}🚀 BUILDING LOCAL IMAGES (Version: $VERSION)${RESET}"
        echo ""
        
        # If no specific directories provided, build all directories with Dockerfiles
        if [[ ${#TARGET_DIRS[@]} -eq 0 ]]; then
            echo -e "${BOLD_BLUE}No specific directories provided. Scanning for all buildable directories...${RESET}"
            readarray -t TARGET_DIRS < <(get_all_buildable_dirs)
            
            if [[ ${#TARGET_DIRS[@]} -eq 0 ]]; then
                echo -e "${BOLD_RED}❌ No directories with Dockerfiles found.${RESET}"
                exit 1
            fi
            
            echo -e "${BOLD_BLUE}Found buildable directories: ${TARGET_DIRS[*]}${RESET}"
        fi
        
        # Build each specified directory
        success_count=0
        total_count=${#TARGET_DIRS[@]}
        
        for target_dir in "${TARGET_DIRS[@]}"; do
            echo ""
            if build_image "$target_dir"; then
                ((success_count++))
            fi
        done
        
        echo ""
        echo -e "${BOLD_YELLOW}📊 Build Summary:${RESET}"
        echo -e "  ${BOLD_GREEN}✅ Successful: $success_count${RESET}"
        echo -e "  ${BOLD_RED}❌ Failed: $((total_count - success_count))${RESET}"
        echo -e "  📦 Total: $total_count"
        ;;
    
    run)
        echo -e "${BOLD_YELLOW}🚀 RUNNING CONTAINERS (Version: $VERSION)${RESET}"
        echo ""
        
        if [[ ${#TARGET_DIRS[@]} -eq 0 ]]; then
            echo -e "${BOLD_RED}❌ No directories specified for run command.${RESET}"
            echo "Usage: $0 run [directories...]"
            exit 1
        fi
        
        success_count=0
        total_count=${#TARGET_DIRS[@]}
        
        for target_dir in "${TARGET_DIRS[@]}"; do
            echo ""
            app_name=$(basename "$target_dir")
            port_mapping=$(get_port_mapping "$app_name" "$CUSTOM_PORT")
            
            if run_container "$target_dir" "$port_mapping"; then
                ((success_count++))
            fi
        done
        
        echo ""
        echo -e "${BOLD_YELLOW}📊 Run Summary:${RESET}"
        echo -e "  ${BOLD_GREEN}✅ Successful: $success_count${RESET}"
        echo -e "  ${BOLD_RED}❌ Failed: $((total_count - success_count))${RESET}"
        echo -e "  📦 Total: $total_count"
        ;;
    
    build-run)
        echo -e "${BOLD_YELLOW}🔄 BUILD AND RUN (Version: $VERSION)${RESET}"
        echo ""
        
        if [[ ${#TARGET_DIRS[@]} -eq 0 ]]; then
            echo -e "${BOLD_RED}❌ No directories specified for build-run command.${RESET}"
            echo "Usage: $0 build-run [directories...]"
            exit 1
        fi
        
        success_count=0
        total_count=${#TARGET_DIRS[@]}
        
        for target_dir in "${TARGET_DIRS[@]}"; do
            echo ""
            app_name=$(basename "$target_dir")
            port_mapping=$(get_port_mapping "$app_name" "$CUSTOM_PORT")
            
            if build_and_run "$target_dir" "$port_mapping"; then
                ((success_count++))
            fi
        done
        
        echo ""
        echo -e "${BOLD_YELLOW}📊 Build-Run Summary:${RESET}"
        echo -e "  ${BOLD_GREEN}✅ Successful: $success_count${RESET}"
        echo -e "  ${BOLD_RED}❌ Failed: $((total_count - success_count))${RESET}"
        echo -e "  📦 Total: $total_count"
        
        if [[ $success_count -gt 0 ]]; then
            echo ""
            show_status
        fi
        ;;
    
    stop)
        echo -e "${BOLD_YELLOW}🛑 STOPPING CONTAINERS${RESET}"
        echo ""
        
        if [[ ${#TARGET_DIRS[@]} -eq 0 ]]; then
            echo -e "${BOLD_BLUE}No specific directories provided. Stopping all app containers...${RESET}"
            readarray -t TARGET_DIRS < <(get_all_buildable_dirs)
        fi
        
        if [[ ${#TARGET_DIRS[@]} -eq 0 ]]; then
            echo -e "${BOLD_RED}❌ No directories found.${RESET}"
            exit 1
        fi
        
        for target_dir in "${TARGET_DIRS[@]}"; do
            app_name=$(basename "$target_dir")
            stop_container "$app_name"
        done
        ;;
    
    *)
        echo -e "${BOLD_RED}Error: Unknown command '$COMMAND'${RESET}"
        usage
        ;;
esac